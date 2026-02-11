"""initial tables

Revision ID: 0001_initial
Revises: 
Create Date: 2026-02-04 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mds",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("pedi_qualified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("cv_qualified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("specialties", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("availability", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    op.create_index("ix_mds_id", "mds", ["id"])
    op.create_index("ix_mds_name", "mds", ["name"])

    op.create_table(
        "crnas",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("pedi_qualified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("cv_qualified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("specialties", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("availability", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    op.create_index("ix_crnas_id", "crnas", ["id"])
    op.create_index("ix_crnas_name", "crnas", ["name"])

    op.create_table(
        "facilities",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("site_name", sa.String(), nullable=False),
        sa.Column("staffing_requirements", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    op.create_index("ix_facilities_id", "facilities", ["id"])
    op.create_index("ix_facilities_site_name", "facilities", ["site_name"], unique=True)

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
    )
    op.create_index("ix_users_id", "users", ["id"])
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    op.create_table(
        "schedules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("facility_id", sa.Integer(), sa.ForeignKey("facilities.id"), nullable=False),
        sa.Column("md_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("crna_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("call_assignments", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    op.create_index("ix_schedules_id", "schedules", ["id"])
    op.create_index("ix_schedules_date", "schedules", ["date"])


def downgrade() -> None:
    op.drop_index("ix_schedules_date", table_name="schedules")
    op.drop_index("ix_schedules_id", table_name="schedules")
    op.drop_table("schedules")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_index("ix_users_id", table_name="users")
    op.drop_table("users")
    op.drop_index("ix_facilities_site_name", table_name="facilities")
    op.drop_index("ix_facilities_id", table_name="facilities")
    op.drop_table("facilities")
    op.drop_index("ix_crnas_name", table_name="crnas")
    op.drop_index("ix_crnas_id", table_name="crnas")
    op.drop_table("crnas")
    op.drop_index("ix_mds_name", table_name="mds")
    op.drop_index("ix_mds_id", table_name="mds")
    op.drop_table("mds")
