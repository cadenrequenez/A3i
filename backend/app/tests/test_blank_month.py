from datetime import date
from app import models
from app.tests.utils import create_user, get_auth_headers


def test_blank_month_and_restore_preserve_both_versions(client, db_session):
    create_user(db_session, 'owner', 'secret', 'admin')
    create_user(db_session, 'viewer', 'secret', 'read-only')
    owner_id = db_session.query(models.User).filter_by(username='owner').one().id
    headers = get_auth_headers(client, 'owner', 'secret')
    site = models.Facility(site_name='Rio Grande Regional Hospital')
    other = models.Facility(site_name='Other site')
    doctors = [models.MD(name=f'Doctor {i}', active=True) for i in range(3)]
    db_session.add_all([site, other, *doctors]); db_session.commit()
    a, b, c = [p.id for p in doctors]
    original = models.Schedule(owner_id=owner_id, date=date(2026,11,1), facility_id=site.id, md_ids=[a,b], crna_ids=[123], call_assignments={'first_call_md_id':a,'second_call_md_id':b})
    untouched = models.Schedule(owner_id=owner_id, date=date(2026,11,1), facility_id=other.id, md_ids=[a,b], call_assignments={})
    december = models.Schedule(owner_id=owner_id, date=date(2026,12,1), facility_id=site.id, md_ids=[a,b], call_assignments={})
    db_session.add_all([original, untouched, december]); db_session.commit()
    payload = {'facility_id':site.id,'year':2026,'month':11}
    base = '/api/v1/schedules/manual/'
    assert client.post(base+'blank-month',json=payload).status_code==401
    assert client.post(base+'blank-month',json=payload,headers=get_auth_headers(client,'viewer','secret')).status_code==403
    assert client.post(base+'blank-month',json=payload,headers=headers).status_code==200
    db_session.refresh(original)
    assert original.call_assignments == {} and original.md_ids == []
    assert original.crna_ids == [123]
    assert untouched.md_ids == [a,b] and december.md_ids == [a,b]
    assert client.get(base+'month-backup',params=payload,headers=headers).json()['available'] is True
    assert client.post(base+'blank-month',json=payload,headers=headers).status_code==409
    new = {'date':'2026-11-02','facility_id':site.id,'first_call_md_id':b,'second_call_md_id':c}
    assert client.put(base+'day',json=new,headers=headers).status_code==200
    assert client.post(base+'restore-month',json=payload,headers=headers).status_code==200
    db_session.refresh(original)
    assert original.md_ids == [a,b]
    second = db_session.query(models.Schedule).filter_by(date=date(2026,11,2),facility_id=site.id).one()
    assert second.md_ids == []
    # Restore again brings back the unfinished manual draft, including the new day.
    assert client.post(base+'restore-month',json=payload,headers=headers).status_code==200
    db_session.refresh(original); db_session.refresh(second)
    assert original.md_ids == [] and second.md_ids == [b,c]
    assert client.post(base+'blank-month',json={**payload,'month':13},headers=headers).status_code==422
