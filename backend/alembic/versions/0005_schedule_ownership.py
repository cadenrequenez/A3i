"""Isolate calendars by account; preserve the legacy calendar for Daniel."""
from alembic import op
import sqlalchemy as sa
revision = '0005_schedule_ownership'
down_revision = '0004_schedule_month_backups'
branch_labels = None
depends_on = None

def upgrade():
    conn = op.get_bind()
    owner = conn.execute(sa.text("SELECT id FROM users WHERE username = 'daniel.requenez'")).scalar()
    if owner is None:
        owner = conn.execute(sa.text("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1")).scalar()
    for table in ('schedules', 'schedule_month_backups'):
        if owner is None and conn.execute(sa.text(f'SELECT count(*) FROM {table}')).scalar():
            raise RuntimeError('An account is required to preserve existing schedules before migration.')
        op.add_column(table, sa.Column('owner_id', sa.Integer(), nullable=True))
        op.create_foreign_key(f'fk_{table}_owner', table, 'users', ['owner_id'], ['id'])
        conn.execute(sa.text(f'UPDATE {table} SET owner_id = :owner'), {'owner': owner})
        op.alter_column(table, 'owner_id', nullable=False)
        op.create_index(f'ix_{table}_owner_id', table, ['owner_id'])
    for constraint in sa.inspect(conn).get_unique_constraints('schedule_month_backups'):
        if set(constraint['column_names']) == {'facility_id','year','month'}:
            op.drop_constraint(constraint['name'], 'schedule_month_backups', type_='unique')
    op.create_unique_constraint('uq_month_backup_owner', 'schedule_month_backups', ['owner_id','facility_id','year','month'])

def downgrade():
    raise RuntimeError('Automatic downgrade would merge private account calendars. Restore a database backup instead.')
