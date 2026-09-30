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
