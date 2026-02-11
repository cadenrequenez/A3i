"""add active flags to staff

Revision ID: 0002_add_active_to_staff
Revises: 0001_initial
Create Date: 2026-02-10
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0002_add_active_to_staff"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("mds", sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("crnas", sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.alter_column("mds", "active", server_default=None)
    op.alter_column("crnas", "active", server_default=None)


def downgrade() -> None:
    op.drop_column("crnas", "active")
    op.drop_column("mds", "active")
