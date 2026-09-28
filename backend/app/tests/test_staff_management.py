from app import models
from app.tests.utils import create_user, get_auth_headers


def test_dad_profile_and_permissions(client, db_session):
    create_user(db_session, "owner", "secret", "admin")
    headers = get_auth_headers(client, "owner", "secret")
    payload = {"username": "daniel.requenez", "password": "test-only-long-password", "role": "admin", "display_name": "Daniel Requenez, MD", "title": "President"}
    response = client.post('/api/v1/auth/users', headers=headers, json=payload)
    assert response.status_code == 200
    dad = get_auth_headers(client, payload['username'], payload['password'])
    profile = client.get('/api/v1/auth/me', headers=dad).json()
    assert profile['display_name'] == 'Daniel Requenez, MD'
    assert profile['title'] == 'President'
    assert 'password_hash' not in profile
    assert client.post('/api/v1/mds/', headers=dad, json={'name':'New Doctor'}).status_code == 200


def test_staff_edits_preserve_history_and_scheduling_identity(client, db_session):
    create_user(db_session, 'owner', 'secret', 'admin')
    h = get_auth_headers(client, 'owner', 'secret')
    row = client.post('/api/v1/mds/', headers=h, json={'name':'Daniel Requenez','cv_qualified':True}).json()
    result = client.put(f"/api/v1/mds/{row['id']}", headers=h, json={'name':'Daniel Requenez, MD','active':False})
    assert result.status_code == 200
    assert result.json()['id'] == row['id']
    assert result.json()['cv_qualified'] is True
    stored = db_session.get(models.MD,row['id'])
    assert stored.availability['scheduling_name'] == 'Daniel Requenez'
    assert client.get('/api/v1/mds/',headers=h).json() == []
    assert len(client.get('/api/v1/mds/?include_inactive=true',headers=h).json()) == 1
    assert client.put(f"/api/v1/mds/{row['id']}", headers=h, json={'name':'  '}).status_code == 422


def test_staffing_amounts_validate_and_viewers_cannot_edit(client, db_session):
    create_user(db_session,'owner','secret','admin')
    create_user(db_session,'viewer','secret','read-only')
    h=get_auth_headers(client,'owner','secret'); viewer=get_auth_headers(client,'viewer','secret')
    site=client.post('/api/v1/facilities/',headers=h,json={'site_name':'Test site','staffing_requirements':{'md':2,'crna':4,'cv_required':True}}).json()
    url=f"/api/v1/facilities/{site['id']}"
    payload={'staffing_requirements':{'md':3,'crna':5,'cv_required':True}}
    assert client.put(url,headers=viewer,json=payload).status_code == 403
    result=client.put(url,headers=h,json=payload)
    assert result.status_code==200
    assert result.json()['staffing_requirements']==payload['staffing_requirements']
    for bad in [-1,1.5,True,101]:
        assert client.put(url,headers=h,json={'staffing_requirements':{'md':bad}}).status_code==422
    assert client.post('/api/v1/crnas/',headers=viewer,json={'name':'Unauthorized'}).status_code==403
