"""Separate home CRNA rosters and immutable audience-specific issued copies."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0008_workforce_issues"
down_revision = "0007_workforce"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("workforce_settings", sa.Column("site_crnas", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")))
    op.create_table("workforce_issues",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("section", sa.String(40), nullable=False),
        sa.Column("audience", sa.String(20), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("snapshot", JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("owner_id", "year", "month", "section", "audience", "revision", name="uq_workforce_issue_revision"))
    op.create_index("ix_workforce_issues_owner_id", "workforce_issues", ["owner_id"])


def downgrade():
    op.drop_table("workforce_issues")
    op.drop_column("workforce_settings", "site_crnas")
