from app import models
from app.tests.utils import create_user, get_auth_headers

def test_manual_create_reopen_edit_and_conflict(client, db_session):
    create_user(db_session,'owner','secret','admin')
    create_user(db_session,'viewer','secret','read-only')
    h=get_auth_headers(client,'owner','secret');viewer=get_auth_headers(client,'viewer','secret')
    site=models.Facility(site_name='Rio Grande Regional Hospital');people=[models.MD(name=f'Doctor {i}',active=True) for i in range(3)]
    db_session.add_all([site,*people]);db_session.commit()
    a,b,c=[p.id for p in people]
    payload={'date':'2026-09-01','facility_id':site.id,'first_call_md_id':a,'second_call_md_id':b}
    url='/api/v1/schedules/manual/day'
    assert client.put(url,json=payload,headers=viewer).status_code==403
    assert client.put(url,json=payload).status_code==401
    result=client.put(url,json=payload,headers=h);assert result.status_code==200
    row=result.json();assert row['md_ids']==[a,b]
    assert client.get(f"/api/v1/schedules/{row['id']}",headers=h).json()['call_assignments']['first_call_md_id']==a
    # Retrying the same save cannot create a duplicate.
    assert client.put(url,json=payload,headers=h).json()['id']==row['id']
    assert db_session.query(models.Schedule).count()==1
    stale={**payload,'second_call_md_id':c}
    assert client.put(url,json=stale,headers=h).status_code==409
    edited={**stale,'expected_first_call_md_id':a,'expected_second_call_md_id':b}
    assert client.put(url,json=edited,headers=h).json()['md_ids']==[a,c]
    assert client.put(url,json=payload,headers=h).status_code==409
    assert db_session.query(models.Schedule).count()==1

def test_manual_rejects_invalid_assignments_without_writes(client,db_session):
    create_user(db_session,'owner','secret','admin');h=get_auth_headers(client,'owner','secret')
    site=models.Facility(site_name='Rio Grande Regional Hospital');active=models.MD(name='Active',active=True);inactive=models.MD(name='Inactive',active=False)
    db_session.add_all([site,active,inactive]);db_session.commit()
    p={'date':'2026-09-01','facility_id':site.id,'first_call_md_id':active.id,'second_call_md_id':active.id}
    for second in (active.id,inactive.id,999999):
        assert client.put('/api/v1/schedules/manual/day',headers=h,json={**p,'second_call_md_id':second}).status_code==422
    assert db_session.query(models.Schedule).count()==0

def test_partial_days_can_be_resumed_and_cleared(client,db_session):
    create_user(db_session,'owner','secret','admin');h=get_auth_headers(client,'owner','secret')
    site=models.Facility(site_name='Rio Grande Regional Hospital');md=models.MD(name='Doctor',active=True)
    db_session.add_all([site,md]);db_session.commit()
    url='/api/v1/schedules/manual/day';p={'date':'2026-10-01','facility_id':site.id}
    previous=(None,None)
    for pair in [(md.id,None),(None,md.id),(None,None)]:
        result=client.put(url,headers=h,json={**p,'first_call_md_id':pair[0],'second_call_md_id':pair[1],'expected_first_call_md_id':previous[0],'expected_second_call_md_id':previous[1]})
        assert result.status_code==200,result.text
        data=result.json();assert data['md_ids']==[x for x in pair if x is not None]
        assert (data['call_assignments']['first_call_md_id'],data['call_assignments']['second_call_md_id'])==pair
        previous=pair
    assert db_session.query(models.Schedule).count()==1


def test_time_off_is_owned_and_survives_blank_month(client,db_session):
    create_user(db_session,'owner','secret','admin');create_user(db_session,'other','secret','admin')
    h=get_auth_headers(client,'owner','secret');other=get_auth_headers(client,'other','secret')
    site=models.Facility(site_name='Rio Grande Regional Hospital');md=models.MD(name='Doctor')
    db_session.add_all([site,md]);db_session.commit()
    url='/api/v1/schedules/manual/time-off';p={'facility_id':site.id,'md_id':md.id,'start_date':'2026-10-30','end_date':'2026-11-02'}
    result=client.post(url,headers=h,json=p);assert result.status_code==200,result.text
    entry=result.json();assert client.post(url,headers=h,json=p).json()['id']==entry['id']
    assert client.get(url,headers=other,params={'facility_id':site.id}).json()==[]
    assert client.delete(f"{url}/{entry['id']}",headers=other).status_code==404
    assert client.post(url,headers=h,json={**p,'end_date':'2026-10-01'}).status_code==422
    assert client.post('/api/v1/schedules/manual/blank-month',headers=h,json={'facility_id':site.id,'year':2026,'month':10}).status_code==200
    assert len(client.get(url,headers=h,params={'facility_id':site.id}).json())==1
    assert client.delete(f"{url}/{entry['id']}",headers=h).status_code==200
    assert client.get(url,headers=h,params={'facility_id':site.id}).json()==[]


def test_guest_names_are_day_only_and_concurrency_protected(client, db_session):
    create_user(db_session, 'owner', 'secret', 'admin')
    create_user(db_session, 'other', 'secret', 'admin')
    h = get_auth_headers(client, 'owner', 'secret')
    other = get_auth_headers(client, 'other', 'secret')
    site = models.Facility(site_name='Rio Grande Regional Hospital')
    md = models.MD(name='Roster Doctor', active=True)
    db_session.add_all([site, md]); db_session.commit()
    url = '/api/v1/schedules/manual/day'
    payload = {'date': '2026-11-01', 'facility_id': site.id, 'first_call_guest_name': '  Visiting Doctor  '}
    result = client.put(url, headers=h, json=payload)
    assert result.status_code == 200, result.text
    row = result.json()
    assert row['call_assignments']['first_call_guest_name'] == 'Visiting Doctor'
    assert row['md_ids'] == []
    assert db_session.query(models.MD).count() == 1
    assert client.get('/api/v1/schedules/', headers=other).json() == []
    assert client.get(f"/api/v1/schedules/{row['id']}", headers=h).json()['call_assignments']['first_call_guest_name'] == 'Visiting Doctor'
    assert client.put(url, headers=h, json=payload).json()['id'] == row['id']
    # A stale save cannot silently remove a guest name.
    assert client.put(url, headers=h, json={**payload, 'first_call_guest_name': None}).status_code == 409
    assert client.put(url, headers=h, json={**payload, 'second_call_guest_name': 'visiting doctor'}).status_code == 422
    assert client.put(url, headers=h, json={**payload, 'first_call_md_id': md.id}).status_code == 422
    edited = {**payload, 'expected_first_call_guest_name': 'Visiting Doctor', 'second_call_md_id': md.id}
    assert client.put(url, headers=h, json=edited).status_code == 200
    cleared = {**edited, 'first_call_guest_name': None, 'expected_second_call_md_id': md.id}
    assert client.put(url, headers=h, json=cleared).json()['call_assignments']['first_call_guest_name'] is None
    assert db_session.query(models.MD).count() == 1


def test_selected_day_off_saves_atomically_and_preserves_neighboring_days(client, db_session):
    from app.models.schedule import ScheduleTimeOff
    create_user(db_session, 'owner', 'secret', 'admin'); create_user(db_session, 'other', 'secret', 'admin')
    h = get_auth_headers(client, 'owner', 'secret'); other = get_auth_headers(client, 'other', 'secret')
    site = models.Facility(site_name='Rio Grande Regional Hospital')
    people = [models.MD(name=f'Doctor {i}', active=True) for i in range(2)]
    db_session.add_all([site, *people]); db_session.commit()
    a, b = [p.id for p in people]
    off_url = '/api/v1/schedules/manual/time-off'
    span = {'facility_id': site.id, 'md_id': a, 'start_date': '2026-11-01', 'end_date': '2026-11-03'}
    assert client.post(off_url, headers=h, json=span).status_code == 200
    assert client.post(off_url, headers=other, json=span).status_code == 200
    url = '/api/v1/schedules/manual/day'
    payload = {'facility_id': site.id, 'date': '2026-11-02', 'first_call_guest_name': 'Locum', 'off_md_ids': [b], 'expected_off_md_ids': [a]}
    response = client.put(url, headers=h, json=payload)
    assert response.status_code == 200, response.text
    entries = response.json()['time_off_entries']
    assert {(r['md_id'], r['start_date'], r['end_date']) for r in entries} == {(a,'2026-11-01','2026-11-01'),(a,'2026-11-03','2026-11-03'),(b,'2026-11-02','2026-11-02')}
    assert client.get(off_url, headers=other, params={'facility_id': site.id}).json()[0]['end_date'] == '2026-11-03'
    assert client.put(url, headers=h, json=payload).status_code == 200
    # Concurrent off edits reject the complete save, including call-name changes.
    stale = {**payload, 'first_call_guest_name': 'Replacement', 'expected_first_call_guest_name': 'Locum', 'off_md_ids': []}
    assert client.put(url, headers=h, json=stale).status_code == 409
    assert db_session.query(models.Schedule).first().call_assignments['first_call_guest_name'] == 'Locum'
    assert client.put(url, headers=h, json={**stale, 'expected_off_md_ids': [b]}).status_code == 200
    assert db_session.query(ScheduleTimeOff).filter_by(md_id=b).count() == 0


def test_removed_roster_doctor_can_be_kept_but_not_newly_assigned(client, db_session):
    create_user(db_session, 'owner', 'secret', 'admin'); h = get_auth_headers(client, 'owner', 'secret')
    site = models.Facility(site_name='Rio Grande Regional Hospital'); md = models.MD(name='Manny', active=True)
    db_session.add_all([site, md]); db_session.commit()
    url = '/api/v1/schedules/manual/day'
    payload = {'facility_id': site.id, 'date': '2026-11-02', 'first_call_md_id': md.id}
    saved = client.put(url, headers=h, json=payload).json()
    assert client.put(f'/api/v1/mds/{md.id}', headers=h, json={'active': False}).status_code == 200
    assert client.get('/api/v1/mds/', headers=h).json() == []
    assert client.get(f"/api/v1/schedules/{saved['id']}", headers=h).json()['call_assignments']['first_call_md_id'] == md.id
    assert client.put(url, headers=h, json={**payload, 'expected_first_call_md_id': md.id, 'second_call_guest_name': 'Visitor'}).status_code == 200
    assert client.put(url, headers=h, json={**payload, 'date': '2026-11-03'}).status_code == 422


def test_multiple_off_people_can_be_saved_reopened_and_removed_individually(client, db_session):
    create_user(db_session, 'owner', 'secret', 'admin'); h = get_auth_headers(client, 'owner', 'secret')
    site = models.Facility(site_name='Rio Grande Regional Hospital')
    people = [models.MD(name=f'Off Doctor {i}', active=True) for i in range(3)]
    db_session.add_all([site, *people]); db_session.commit()
    a, b, c = [p.id for p in people]
    url = '/api/v1/schedules/manual/day'
    p = {'facility_id': site.id, 'date': '2026-11-02', 'first_call_md_id': c, 'off_md_ids': [a, b], 'expected_off_md_ids': []}
    saved = client.put(url, headers=h, json=p)
    assert saved.status_code == 200, saved.text
    assert {r['md_id'] for r in saved.json()['time_off_entries']} == {a, b}
    reopened = client.get('/api/v1/schedules/manual/time-off', headers=h, params={'facility_id': site.id}).json()
    assert {r['md_id'] for r in reopened} == {a, b}
    revised = {**p, 'expected_first_call_md_id': c, 'expected_off_md_ids': [a, b], 'off_md_ids': [b]}
    saved = client.put(url, headers=h, json=revised)
    assert saved.status_code == 200, saved.text
    assert {r['md_id'] for r in saved.json()['time_off_entries']} == {b}
    assert saved.json()['call_assignments']['first_call_md_id'] == c
    assert saved.json()['call_assignments']['second_call_md_id'] is None
