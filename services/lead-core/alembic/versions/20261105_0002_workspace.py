"""Add headquarters intelligence and controlled research without rebuilding CRM tables."""
from alembic import op
from lead_core.intelligence import models  # noqa: F401
from lead_core.models import Base

revision = "20261105_0002"
down_revision = "20260901_0001"
branch_labels = None
depends_on = None

TABLES = {
    "intelligence_sources", "intelligence_articles", "intelligence_saved", "research_tasks",
    "workspace_tasks", "ai_budget_days", "ai_model_calls", "workspace_proposals", "intelligence_cursors", "workspace_members", "ai_jobs",
}


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
    Base.metadata.drop_all(op.get_bind(), tables=[t for t in Base.metadata.sorted_tables if t.name in TABLES])
