"""Source-backed company records, collection queue, and daily summaries."""
from alembic import op
from lead_core.company_intelligence import models  # noqa: F401
from lead_core.models import Base

revision = "20261109_0006"
down_revision = "20261106_0005"
branch_labels = None
depends_on = None

TABLES = {"monitored_companies", "company_intelligence_records", "company_intelligence_runs", "company_intelligence_briefings"}


def upgrade():
    bind = op.get_bind()
    Base.metadata.create_all(bind, tables=[t for t in Base.metadata.sorted_tables if t.name in TABLES])
    if bind.dialect.name == "postgresql":
        for name in TABLES:
            op.execute(f'ALTER TABLE "{name}" ENABLE ROW LEVEL SECURITY')
            op.execute(f'ALTER TABLE "{name}" FORCE ROW LEVEL SECURITY')
            op.execute(f'''CREATE POLICY "hq_only_{name}" ON "{name}"
                USING (current_setting('app.is_hq', true) = 'true' OR current_setting('app.is_worker', true) = 'true')
                WITH CHECK (current_setting('app.is_hq', true) = 'true' OR current_setting('app.is_worker', true) = 'true')''')


def downgrade():
    raise RuntimeError("Restore a verified backup to preserve company evidence and collection history")
