"""Private workforce drafts and rosters, separate from existing call schedules."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0007_workforce"
down_revision = "0006_schedule_time_off"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("workforce_settings",
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("rosters", JSONB(), nullable=False),
        sa.Column("crnas", JSONB(), nullable=False))
    op.create_table("workforce_days",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("payload", JSONB(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("owner_id", "date", name="uq_workforce_day_owner"))
    op.create_index("ix_workforce_days_owner_id", "workforce_days", ["owner_id"])
    op.create_table("workforce_history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("payload", JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.create_index("ix_workforce_history_owner_id", "workforce_history", ["owner_id"])
    op.create_table("workforce_months",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.UniqueConstraint("owner_id", "year", "month", name="uq_workforce_month_owner"))
    op.create_index("ix_workforce_months_owner_id", "workforce_months", ["owner_id"])


def downgrade():
    for table in ("workforce_months", "workforce_history", "workforce_days", "workforce_settings"):
        op.drop_table(table)
