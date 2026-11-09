import pytest
from fastapi.testclient import TestClient

from lead_core.models import Franchisee, Membership
from lead_core.services.memberships import MembershipLimitError, add_membership


def test_franchisee_cannot_have_more_than_three_members(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        session.add(Franchisee(id="org-a", name="苏州宏达加盟店"))
        session.commit()
        for index in range(3):
            add_membership(
                session,
                franchisee_id="org-a",
                user_id=f"user-{index}",
                role="franchise_member",
            )
        session.commit()

        with pytest.raises(MembershipLimitError, match="maximum of 3 members"):
            add_membership(
                session,
                franchisee_id="org-a",
                user_id="user-4",
                role="franchise_member",
            )

        assert session.query(Membership).filter_by(franchisee_id="org-a").count() == 3
