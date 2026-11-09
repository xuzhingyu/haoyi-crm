"""Add personal workbench without changing historical business values."""
from alembic import op
from app.studio_models import StudioRecord, StudioLock, NewsJob, ModelUsage

revision = "0003_studio"
down_revision = "0002_lifecycle"
branch_labels = None
depends_on = None

def upgrade():
    bind = op.get_bind()
    for model in (StudioRecord, StudioLock, NewsJob, ModelUsage):
        model.__table__.create(bind, checkfirst=True)
    bind.execute(StudioLock.__table__.insert().values(id=1, revision=0).prefix_with("OR IGNORE") if bind.dialect.name == "sqlite" else StudioLock.__table__.insert().values(id=1, revision=0))

def downgrade():
    for name in ("model_usage", "news_jobs", "studio_records", "studio_locks"):
        op.drop_table(name)
