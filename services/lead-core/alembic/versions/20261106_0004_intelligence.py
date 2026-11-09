"""CRM-owned notes, follows and source excerpt snapshots."""
import sqlalchemy as sa

from alembic import op
from lead_core.intelligence.models import ArticleNote, IntelligenceFollow

revision = "20261106_0004"
down_revision = "20261105_0003"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    columns = {c["name"] for c in sa.inspect(bind).get_columns("intelligence_articles")}
    with op.batch_alter_table("intelligence_articles") as batch:
        for column in [sa.Column("content", sa.Text(), nullable=False, server_default=""),
                       sa.Column("content_kind", sa.String(30), nullable=False, server_default="index_only"),
                       sa.Column("upstream_updated_at", sa.DateTime(timezone=True)),
                       sa.Column("snapshot_hash", sa.String(64))]:
            if column.name not in columns:
                batch.add_column(column)
    for model in (ArticleNote, IntelligenceFollow):
        model.__table__.create(bind, checkfirst=True)
        if bind.dialect.name == "postgresql":
            table = model.__tablename__
            op.execute(f'ALTER TABLE {table} ENABLE ROW LEVEL SECURITY')
            op.execute(f'ALTER TABLE {table} FORCE ROW LEVEL SECURITY')
            op.execute(f'''CREATE POLICY hq_only_{table} ON {table}
                USING (current_setting('app.is_hq',true)='true' OR current_setting('app.is_worker',true)='true')
                WITH CHECK (current_setting('app.is_hq',true)='true' OR current_setting('app.is_worker',true)='true')''')


def downgrade():
    raise RuntimeError("Restore the verified backup to preserve user notes and follows")
