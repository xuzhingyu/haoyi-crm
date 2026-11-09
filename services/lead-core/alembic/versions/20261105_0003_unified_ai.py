"""Generic AI ledger and cross-system confirmations, preserving existing records."""
import sqlalchemy as sa

from alembic import op
from lead_core.intelligence.models import AiJob

revision = "20261105_0003"
down_revision = "20261105_0002"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    AiJob.__table__.create(bind, checkfirst=True)
    columns = {c["name"] for c in sa.inspect(bind).get_columns("ai_model_calls")}
    with op.batch_alter_table("ai_model_calls") as batch:
        if "ai_job_id" not in columns:
            batch.add_column(sa.Column("ai_job_id", sa.String(36), nullable=True))
            batch.create_foreign_key("fk_ai_call_job", "ai_jobs", ["ai_job_id"], ["id"])
            batch.create_index("ix_ai_model_calls_ai_job_id", ["ai_job_id"])
        batch.alter_column("research_id", existing_type=sa.String(36), nullable=True)
    columns = {c["name"] for c in sa.inspect(bind).get_columns("workspace_proposals")}
    with op.batch_alter_table("workspace_proposals") as batch:
        for column in [sa.Column("target_system", sa.String(40), nullable=False, server_default="lead_core"),
                       sa.Column("target_version", sa.String(100)), sa.Column("execution_result", sa.JSON()),
                       sa.Column("last_error", sa.Text())]:
            if column.name not in columns:
                batch.add_column(column)
    if bind.dialect.name == "postgresql":
        # RLS also applies while migrations run as the ordinary application role.
        op.execute("SELECT set_config('app.is_worker','true',true)")
    jobs = AiJob.__table__
    rows = bind.execute(sa.text("SELECT DISTINCT r.id,r.created_by,r.status,r.created_at,r.cost_cny FROM research_tasks r JOIN ai_model_calls c ON c.research_id=r.id WHERE c.ai_job_id IS NULL")).mappings().all()
    for row in rows:
        existing = bind.execute(sa.select(jobs.c.id).where(jobs.c.request_id == "research:" + row["id"])).scalar()
        job_id = existing or row["id"]
        if not existing:
            bind.execute(jobs.insert().values(id=job_id, request_id="research:" + row["id"], input_hash="historical",
                actor_sub=row["created_by"], purpose="research", source_system="workspace", source_id=row["id"],
                research_id=row["id"], status="completed" if row["status"] == "completed" else "failed",
                cost_cny=row["cost_cny"], created_at=row["created_at"]))
        bind.execute(sa.text("UPDATE ai_model_calls SET ai_job_id=:job WHERE research_id=:research AND ai_job_id IS NULL"), {"job":job_id,"research":row["id"]})
    if bind.dialect.name == "postgresql":
        op.execute('ALTER TABLE ai_jobs ENABLE ROW LEVEL SECURITY')
        op.execute('ALTER TABLE ai_jobs FORCE ROW LEVEL SECURITY')
        op.execute('DROP POLICY IF EXISTS hq_only_ai_jobs ON ai_jobs')
        op.execute("""CREATE POLICY hq_only_ai_jobs ON ai_jobs
            USING (current_setting('app.is_hq',true)='true' OR current_setting('app.is_worker',true)='true')
            WITH CHECK (current_setting('app.is_hq',true)='true' OR current_setting('app.is_worker',true)='true')""")


def downgrade():
    # Generic CRM jobs cannot fit the old research-only schema without losing the ledger.
    raise RuntimeError("Restore the verified pre-release backup to roll back this additive ledger migration")
