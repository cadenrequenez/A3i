from app import models
from app.models.workforce import WorkforceSettings, WorkforceDay
from app.tests.utils import create_user, get_auth_headers
from datetime import date

URL = '/api/v1/schedules/driscoll/day'

def setup(db, client):
    owner = create_user(db, 'driscoll-owner', 'secret', 'admin')
    create_user(db, 'other', 'secret', 'admin')
    create_user(db, 'viewer', 'secret', 'read-only')
    rio = models.Facility(site_name='Rio Grande Regional Hospital')
    site = models.Facility(site_name='Driscoll Children’s Hospital')
    db.add_all([rio, site]); db.commit()
    db.add(WorkforceSettings(owner_id=owner.id, rosters={str(site.id): [
        dict(key='driscoll-a', name='Manny Cavazos', active=True),
        dict(key='driscoll-b', name='Daniel Ruiz', active=True),
        dict(key='driscoll-c', name='Camille Graham', active=True),
        dict(key='removed', name='Removed MD', active=False),
    ]}, crnas=[]))
    db.commit()
    return owner, rio, site, get_auth_headers(client,'driscoll-owner','secret')

def test_partial_save_reopen_edit_and_concurrent_tabs(client, db_session):
    _, rio, site, h = setup(db_session, client)
    p = dict(date='2026-10-01', facility_id=site.id, expected_revision=0, first={'key':'driscoll-a'})
    response = client.put(URL, headers=h, json=p); assert response.status_code == 200, response.text
    row = response.json(); calls = row['call_assignments']
    assert calls['first_call_name'] == 'Manny Cavazos' and calls['second_call_name'] is None
    assert calls['revision'] == 1
    assert client.get(f"/api/v1/schedules/{row['id']}",headers=h).json()['call_assignments'] == calls
    assert client.put(URL, headers=h, json=p).status_code == 409
    p.update(expected_revision=1, second={'key':'driscoll-b'})
    row = client.put(URL,headers=h,json=p).json()
    assert row['call_assignments']['second_call_name'] == 'Daniel Ruiz'
    p.update(expected_revision=2, first={}, second={'key':'driscoll-a'})
    response=client.put(URL,headers=h,json=p); assert response.status_code == 200, response.text
    assert response.json()['call_assignments']['first_call_name'] is None
    p.update(expected_revision=3, second={})
    assert client.put(URL,headers=h,json=p).json()['call_assignments']['second_call_name'] is None
    assert db_session.query(models.Schedule).count() == 1
    assert client.put(URL,headers=h,json={**p,'facility_id':rio.id}).status_code == 400

def test_own_roster_guests_off_and_account_isolation(client,db_session):
    owner, rio, site, h=setup(db_session,client)
    before=db_session.get(WorkforceSettings,owner.id).rosters
    p=dict(date='2026-10-02',facility_id=site.id,expected_revision=0,
           first={'guest_name':'  Visiting Doctor  '}, off_keys=['driscoll-b','driscoll-c'])
    response=client.put(URL,headers=h,json=p);assert response.status_code==200,response.text
    calls=response.json()['call_assignments'];assert calls['first_call_name']=='Visiting Doctor'
    assert calls['off_names']==['Daniel Ruiz','Camille Graham']
    assert db_session.get(WorkforceSettings,owner.id).rosters==before
    assert db_session.query(models.MD).count()==0
    other=get_auth_headers(client,'other','secret')
    assert client.get('/api/v1/schedules/',headers=other).json()==[]
    assert client.put(URL,headers=other,json={**p,'first':{'key':'driscoll-a'}}).status_code==422
    assert client.put(URL,headers=get_auth_headers(client,'viewer','secret'),json=p).status_code==403
    assert client.put(URL,json=p).status_code==401
    for first,second in [({'key':'rio-only'},{}),({'key':'removed'},{}),({'key':'driscoll-a','guest_name':'Bad'},{}),({'guest_name':'Same'},{'guest_name':'same'}),({'key':'driscoll-a'},{'guest_name':'Manny Cavazos'})]:
        result=client.put(URL,headers=h,json={**p,'date':'2026-10-03','first':first,'second':second})
        assert result.status_code==422,result.text
    assert client.put(URL,headers=h,json={**p,'date':'2026-10-03','off_keys':['driscoll-a','driscoll-a']}).status_code==422
    assert client.put(URL,headers=h,json={**p,'expected_revision':1,'off_keys':['driscoll-c']}).json()['call_assignments']['off_names']==['Camille Graham']

def test_blank_restore_preserves_rio_workforce_off_and_revision(client,db_session):
    owner,rio,site,h=setup(db_session,client)
    rio_row=models.Schedule(owner_id=owner.id,facility_id=rio.id,date=date(2026,10,1),md_ids=[],crna_ids=[],call_assignments={'first_call_guest_name':'Rio only'})
    workforce=WorkforceDay(owner_id=owner.id,date=date(2026,10,1),payload={'entries':[],'note':'untouched'},revision=1)
    db_session.add_all([rio_row,workforce]);db_session.commit()
    p=dict(date='2026-10-01',facility_id=site.id,expected_revision=0,first={'key':'driscoll-a'},off_keys=['driscoll-c'])
    row=client.put(URL,headers=h,json=p).json()
    month=dict(facility_id=site.id,year=2026,month=10)
    assert client.post('/api/v1/schedules/manual/blank-month',headers=h,json=month).status_code==200
    current=client.get(f"/api/v1/schedules/{row['id']}",headers=h).json()['call_assignments']
    assert current['revision']==2 and current['off_names']==['Camille Graham'] and not current.get('first_call_name')
    assert client.put(URL,headers=h,json={**p,'expected_revision':1}).status_code==409
    assert client.post('/api/v1/schedules/manual/restore-month',headers=h,json=month).status_code==200
    current=client.get(f"/api/v1/schedules/{row['id']}",headers=h).json()['call_assignments']
    assert current['revision']==3 and current['first_call_name']=='Manny Cavazos'
    assert db_session.get(models.Schedule,rio_row.id).call_assignments=={'first_call_guest_name':'Rio only'}
    assert db_session.get(WorkforceDay,workforce.id).payload=={'entries':[],'note':'untouched'}
    assert client.post('/api/v1/schedules/manual/restore-month',headers=h,json=month).status_code==200
    assert not client.get(f"/api/v1/schedules/{row['id']}",headers=h).json()['call_assignments'].get('first_call_name')

def test_removed_saved_doctor_can_be_kept_not_newly_assigned(client,db_session):
    owner,_,site,h=setup(db_session,client)
    p=dict(date='2026-10-01',facility_id=site.id,expected_revision=0,first={'key':'driscoll-a'})
    assert client.put(URL,headers=h,json=p).status_code==200
    settings=db_session.get(WorkforceSettings,owner.id)
    settings.rosters={str(site.id):[dict(key='driscoll-a',name='Manny Cavazos',active=False)]};db_session.commit()
    assert client.put(URL,headers=h,json={**p,'expected_revision':1,'second':{'guest_name':'Visitor'}}).status_code==200
    assert client.put(URL,headers=h,json={**p,'date':'2026-10-02'}).status_code==422
