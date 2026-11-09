"""Idempotent HQ bootstrap; user passwords remain exclusively in the identity provider."""
import argparse

from sqlalchemy import select

from lead_core.config import Settings
from lead_core.db import apply_rls_context, build_engine, build_session_factory
from lead_core.intelligence.models import WorkspaceMember
from lead_core.intelligence.sources import ensure_sources
from lead_core.models import Franchisee, Membership


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--org", required=True)
    parser.add_argument("--admin", required=True)
    parser.add_argument("--executive", required=True)
    args = parser.parse_args()
    engine = build_engine(Settings().database_url)
    with build_session_factory(engine)() as session:
        apply_rls_context(session, is_worker=True)
        if not session.get(Franchisee, args.org):
            session.add(Franchisee(id=args.org, name="浩宜总部"))
            session.flush()
        for user, name, role in [(args.admin, "徐种宇", "hq_admin"), (args.executive, "CEO", "hq_executive")]:
            if not session.scalar(select(Membership).where(Membership.user_id == user, Membership.franchisee_id == args.org)):
                session.add(Membership(user_id=user, franchisee_id=args.org, role=role))
            if not session.get(WorkspaceMember, user):
                session.add(WorkspaceMember(user_id=user, display_name=name))
        ensure_sources(session)
        session.commit()
    print("HQ profiles and intelligence source registry initialized.")


if __name__ == "__main__":
    main()
