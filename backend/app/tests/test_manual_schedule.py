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
