"""Fixed, read-only aggregate tools. Never expose customer records to a model."""
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from lead_core.config import Settings
from lead_core.intelligence.legacy import legacy_overview
from lead_core.models import Claim, Franchisee, LeadListing, Membership, Opportunity

HQ_ROLES = {"hq_admin", "hq_franchise_manager", "hq_data_reviewer", "hq_auditor", "hq_executive"}
STAGES = ("none", "connected", "qualified", "proposal", "won", "lost")


def business_context(session: Session, settings: Settings, actor_sub: str) -> dict:
    """Read the same HQ aggregate boundary as the overview, rechecking active access."""
    if settings.auth_mode == "oidc":
        membership = session.scalar(
            select(Membership.id).join(Franchisee, Franchisee.id == Membership.franchisee_id)
            .where(Membership.user_id == actor_sub, Membership.role.in_(HQ_ROLES), Franchisee.status == "active")
            .limit(1)
        )
        if membership is None:
            raise ValueError("研究创建者的总部权限已失效，未读取经营汇总")

    def count(model, *conditions):
        return session.scalar(select(func.count()).select_from(model).where(*conditions)) or 0

    legacy = legacy_overview(settings)
    stages = dict(session.execute(select(Opportunity.stage, func.count()).group_by(Opportunity.stage)).all())
    return {
        "captured_at": datetime.now(UTC).isoformat(),
        "scope": "总部经营计数；原 CRM 与公开线索池分别统计，不直接相加；仅为当前快照，不能据此推断趋势或转化率。",
        "legacy_crm": {"available": legacy["available"], "stats": legacy["stats"], "error": legacy["error"]},
        "lead_pool": {
            "available_leads": count(LeadListing, LeadListing.status == "available"),
            "active_claims": count(Claim, Claim.status == "active"),
            "overdue_followups": count(Claim, Claim.status == "active", Claim.activity_due < datetime.now(UTC)),
            "opportunity_stages": {stage: stages.get(stage, 0) for stage in STAGES},
        },
    }
