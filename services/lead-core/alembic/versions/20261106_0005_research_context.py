"""Opt-in, aggregate-only business context for research tasks."""
import sqlalchemy as sa

from alembic import op

revision = "20261106_0005"
down_revision = "20261106_0004"
branch_labels = None
depends_on = None


def upgrade():
    columns = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("research_tasks")}
    with op.batch_alter_table("research_tasks") as batch:
        if "include_business_context" not in columns:
            batch.add_column(sa.Column("include_business_context", sa.Boolean(), nullable=False, server_default=sa.false()))
        if "business_context" not in columns:
            batch.add_column(sa.Column("business_context", sa.JSON(), nullable=True))


def downgrade():
    # Keep the source snapshot for previously published reports and auditability.
    raise RuntimeError("Restore the verified backup to roll back research context")
