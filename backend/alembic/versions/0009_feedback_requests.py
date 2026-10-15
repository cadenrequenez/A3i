"""Authenticated feedback inbox; no schedule changes."""
from alembic import op
import sqlalchemy as sa

revision = "0009_feedback_requests"
down_revision = "0008_workforce_issues"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("feedback_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("expected_behavior", sa.Text(), nullable=False),
        sa.Column("page_context", sa.String(300), nullable=False),
        sa.Column("urgency", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("updated_by_id", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.create_index("ix_feedback_requests_owner_id", "feedback_requests", ["owner_id"])


def downgrade():
    op.drop_table("feedback_requests")
