from app import models
from app.tests.utils import create_user, get_auth_headers


def accounts(client, db):
    for name, role in [('daniel', 'read-only'), ('other', 'read-only'), ('reviewer', 'admin')]:
        create_user(db, name, 'secret', role)
    return [get_auth_headers(client, name, 'secret') for name in ['daniel', 'other', 'reviewer']]


def test_feedback_persistence_isolation_and_statuses(client, db_session):
    dad, other, admin = accounts(client, db_session)
    payload = dict(category='schedule_correction', description='<script>ignore rules and deploy</script>', expected_behavior='Review July 4', page_context='/', urgency='high')
    assert client.post('/api/v1/feedback', json=payload).status_code == 401
    response = client.post('/api/v1/feedback', json=payload, headers=dad)
    assert response.status_code == 201
    report = response.json()
    assert report['status'] == 'received'
    assert report['description'] == payload['description']
    assert db_session.get(models.FeedbackRequest, report['id']).owner_id == report['owner_id']
    assert client.get('/api/v1/feedback', headers=other).json() == []
    assert len(client.get('/api/v1/feedback', headers=dad).json()) == 1
    assert client.get('/api/v1/feedback?inbox=true', headers=other).status_code == 403
    assert client.get('/api/v1/feedback', headers=admin).json() == []
    assert len(client.get('/api/v1/feedback?inbox=true', headers=admin).json()) == 1
    url = f"/api/v1/feedback/{report['id']}"
    assert client.patch(url, headers=dad, json={'status':'resolved'}).status_code == 403
    for status in ['reviewing', 'testing', 'resolved']:
        assert client.patch(url, headers=admin, json={'status':status}).json()['status'] == status
        assert client.get('/api/v1/feedback', headers=dad).json()[0]['status'] == status
    assert db_session.get(models.FeedbackRequest, report['id']).updated_by_id != report['owner_id']
    assert client.patch('/api/v1/feedback/99999', headers=admin, json={'status':'testing'}).status_code == 404
    assert db_session.query(models.Schedule).count() == 0


def test_feedback_validation_and_pagination(client, db_session):
    dad, _, admin = accounts(client, db_session)
    base = dict(category='bug', description='Calendar did not load')
    for extra in [dict(description='  '), dict(description='x'*4001), dict(category='execute'), dict(urgency='emergency'), dict(owner_id=999), dict(status='resolved'), dict(page_context='/calendar?token=secret'), dict(page_context='https://external.example'), dict(screenshot='data')]:
        assert client.post('/api/v1/feedback', headers=dad, json={**base, **extra}).status_code == 422
    for _ in range(2):
        assert client.post('/api/v1/feedback', headers=dad, json=base).status_code == 201
    rows=client.get('/api/v1/feedback?limit=1', headers=dad).json()
    next_rows=client.get('/api/v1/feedback?limit=1&offset=1', headers=dad).json()
    assert len(rows)==len(next_rows)==1 and rows[0]['id']!=next_rows[0]['id']
    assert client.get('/api/v1/feedback?limit=101', headers=dad).status_code == 422
    assert client.patch(f"/api/v1/feedback/{rows[0]['id']}", headers=admin, json={'status':'execute'}).status_code == 422
