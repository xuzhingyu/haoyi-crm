"""Real PostgreSQL RLS and concurrent-budget checks using isolated temporary rows."""
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import delete, select, text, update

from lead_core.config import Settings
from lead_core.db import apply_rls_context, build_engine, build_session_factory
from lead_core.domain.claims import ClaimPolicy
from lead_core.intelligence.models import BudgetDay, WorkTask
from lead_core.models import Claim, LeadListing, RepairBusiness


def main():
    settings = Settings()
    engine = build_engine(settings.database_url)
    if engine.dialect.name != "postgresql":
        raise RuntimeError("This check requires PostgreSQL, not SQLite.")
    factory = build_session_factory(engine)
    suffix = uuid4().hex
    budget_key = "T" + suffix[:9]
    task_id = str(uuid4())
    outcome = {}
    try:
        with factory() as session:
            role = session.execute(text("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user")).one()
            assert not role.rolsuper and not role.rolbypassrls, "Use the normal non-superuser application role"
            apply_rls_context(session, is_worker=True)
            session.add(BudgetDay(day=budget_key, spent=0, reserved=0))
            session.add(WorkTask(id=task_id, title="RLS smoke " + suffix, created_by="smoke", assignee_id="smoke"))
            session.commit()
            session.expunge_all()
            assert session.get(WorkTask, task_id) is None, "Commit must remove privileged transaction context"
            apply_rls_context(session, org_id="smoke-org-a")
            assert session.get(WorkTask, task_id) is None, "Franchise must not see headquarters tasks"
            apply_rls_context(session, is_hq=True)
            assert session.get(WorkTask, task_id) is not None
            outcome["commit_context_reset_and_hq_workspace_rls"] = "passed"
            session.rollback()

        # CRM fixtures never leave this transaction.
        with factory() as session:
            apply_rls_context(session, is_worker=True)
            claim_ids = []
            for org in ("smoke-a-" + suffix, "smoke-b-" + suffix):
                business = RepairBusiness(business_name="RLS smoke " + suffix, city="测试", district="测试", category="测试")
                session.add(business)
                session.flush()
                listing = LeadListing(business_id=business.id, status="claimed", claimed_by_org_id=org)
                session.add(listing)
                session.flush()
                due = ClaimPolicy().deadlines_for(datetime.now(UTC))
                claim = Claim(listing_id=listing.id, org_id=org, user_id="smoke", idempotency_key=suffix, first_touch_due=due.first_touch_due, activity_due=due.activity_due, protected_until=due.protected_until)
                session.add(claim)
                session.flush()
                claim_ids.append(claim.id)
            session.expunge_all()
            for org, expected in [("smoke-a-" + suffix, claim_ids[0]), ("smoke-b-" + suffix, claim_ids[1])]:
                apply_rls_context(session, org_id=org)
                visible = list(session.scalars(select(Claim.id).where(Claim.id.in_(claim_ids))).all())
                assert visible == [expected], "Organization crossed RLS boundary"
            apply_rls_context(session, is_hq=True)
            assert len(session.scalars(select(Claim.id).where(Claim.id.in_(claim_ids))).all()) == 2
            session.rollback()
            outcome["two_org_and_hq_claim_rls"] = "passed"

        def reserve():
            with factory() as session:
                apply_rls_context(session, is_worker=True)
                result = session.execute(update(BudgetDay).where(BudgetDay.day == budget_key, BudgetDay.spent + BudgetDay.reserved + 15 <= 20).values(reserved=BudgetDay.reserved + 15))
                session.commit()
                return result.rowcount
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: reserve(), range(2)))
        assert sum(results) == 1, "Concurrent reservations exceeded the daily ceiling"
        outcome["concurrent_budget_reservation"] = "passed"
    finally:
        with factory() as session:
            apply_rls_context(session, is_worker=True)
            session.execute(delete(WorkTask).where(WorkTask.id == task_id))
            session.execute(delete(BudgetDay).where(BudgetDay.day == budget_key))
            session.commit()
        engine.dispose()
    print(json.dumps(outcome, ensure_ascii=False))


if __name__ == "__main__":
    main()
