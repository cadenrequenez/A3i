"""Account-owned time-off ranges, independent of call drafts and generation."""
from alembic import op
import sqlalchemy as sa
revision = '0006_schedule_time_off'
down_revision = '0005_schedule_ownership'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('schedule_time_off',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('owner_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('facility_id', sa.Integer(), sa.ForeignKey('facilities.id'), nullable=False),
        sa.Column('md_id', sa.Integer(), sa.ForeignKey('mds.id'), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False))
    op.create_index('ix_schedule_time_off_owner_id', 'schedule_time_off', ['owner_id'])

def downgrade():
    op.drop_table('schedule_time_off')
