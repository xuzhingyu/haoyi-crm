"""Add idempotent integration records without rewriting business data."""
from alembic import op
from app.integration_models import ExternalLeadLink, ExternalOperation

revision = "0004_integration"
down_revision = "0003_studio"
branch_labels = None
depends_on = None


def upgrade():
    for model in (ExternalLeadLink, ExternalOperation):
        model.__table__.create(op.get_bind(), checkfirst=True)


def downgrade():
    op.drop_table("external_operations")
    op.drop_table("external_lead_links")
