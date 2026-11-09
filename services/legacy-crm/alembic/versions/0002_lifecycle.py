"""lifecycle tables and columns

Revision ID: 0002_lifecycle
Revises: 0001_initial
Create Date: 2026-09-07
"""

from alembic import op

from app.database import Base, ensure_schema_columns
from app import models  # noqa: F401

revision = "0002_lifecycle"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)
    ensure_schema_columns(bind)


def downgrade() -> None:
    op.drop_table("user_preferences")
    op.drop_table("notifications")
    op.drop_table("entity_events")
