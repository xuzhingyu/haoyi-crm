"""Create the authoritative lead-core schema and tenant RLS policies."""

from alembic import op
from lead_core.models import Base

revision = "20260901_0001"
down_revision = None
branch_labels = None
depends_on = None


TENANT_TABLES = {
    "claims": "org_id",
    "interactions": "org_id",
    "franchise_contacts": "org_id",
    "opportunities": "org_id",
    "contact_preferences": "org_id",
    "memberships": "franchisee_id",
    "audit_events": "actor_org_id",
}

INITIAL_TABLES = {
    "sources", "source_documents", "extraction_candidates", "repair_businesses", "evidence",
    "franchisees", "memberships", "lead_listings", "claims", "interactions", "franchise_contacts",
    "opportunities", "contact_preferences", "audit_events", "outbox_events", "twenty_mirrors",
}


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind, tables=[t for t in Base.metadata.sorted_tables if t.name in INITIAL_TABLES])
    if bind.dialect.name != "postgresql":
        return
    for table, tenant_column in TENANT_TABLES.items():
        op.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')
        op.execute(f'ALTER TABLE "{table}" FORCE ROW LEVEL SECURITY')
        op.execute(
            f'''CREATE POLICY "tenant_isolation_{table}" ON "{table}"
                USING (
                    current_setting('app.is_hq', true) = 'true'
                    OR current_setting('app.is_worker', true) = 'true'
                    OR "{tenant_column}" = nullif(current_setting('app.current_org_id', true), '')
                )
                WITH CHECK (
                    current_setting('app.is_hq', true) = 'true'
                    OR current_setting('app.is_worker', true) = 'true'
                    OR "{tenant_column}" = nullif(current_setting('app.current_org_id', true), '')
                )'''
        )


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind, tables=[t for t in Base.metadata.sorted_tables if t.name in INITIAL_TABLES])
