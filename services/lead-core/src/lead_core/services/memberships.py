from sqlalchemy import func, select
from sqlalchemy.orm import Session

from lead_core.models import Franchisee, Membership


class MembershipLimitError(ValueError):
    pass


def add_membership(
    session: Session,
    *,
    franchisee_id: str,
    user_id: str,
    role: str,
) -> Membership:
    franchisee = session.scalar(
        select(Franchisee)
        .where(Franchisee.id == franchisee_id, Franchisee.status == "active")
        .with_for_update()
    )
    if franchisee is None:
        raise ValueError("active franchisee not found")
    count = session.scalar(
        select(func.count(Membership.id)).where(Membership.franchisee_id == franchisee_id)
    ) or 0
    if count >= 3:
        raise MembershipLimitError("franchisee has a maximum of 3 members")
    membership = Membership(
        franchisee_id=franchisee_id,
        user_id=user_id,
        role=role,
    )
    session.add(membership)
    session.flush()
    return membership
