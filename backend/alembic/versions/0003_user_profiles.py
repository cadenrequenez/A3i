"""Add optional account display names and titles."""
from alembic import op
import sqlalchemy as sa
revision = "0003_user_profiles"
down_revision = "0002_add_active_to_staff"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("users", sa.Column("display_name", sa.String(), nullable=True))
    op.add_column("users", sa.Column("title", sa.String(), nullable=True))

def downgrade():
    op.drop_column("users", "title")
    op.drop_column("users", "display_name")
