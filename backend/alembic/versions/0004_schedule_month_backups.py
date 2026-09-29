"""Preserve the previous call month when starting a blank schedule."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
revision = '0004_schedule_month_backups'
down_revision = '0003_user_profiles'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('schedule_month_backups',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('facility_id', sa.Integer(), sa.ForeignKey('facilities.id'), nullable=False),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('month', sa.Integer(), nullable=False),
        sa.Column('entries', postgresql.JSONB(), nullable=False),
        sa.UniqueConstraint('facility_id', 'year', 'month'))

def downgrade():
    op.drop_table('schedule_month_backups')
