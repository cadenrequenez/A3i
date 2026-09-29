from app import models
from app.tests.utils import create_user, get_auth_headers


def test_accounts_cannot_read_or_change_each_others_calendars(client, db_session):
    create_user(db_session, 'daniel.requenez', 'secret', 'admin')
    create_user(db_session, 'admin', 'secret', 'admin')
    daniel = get_auth_headers(client, 'daniel.requenez', 'secret')
    admin = get_auth_headers(client, 'admin', 'secret')
    site = models.Facility(site_name='Rio Grande Regional Hospital')
    doctors = [models.MD(name=f'Doctor {i}', active=True, cv_qualified=True) for i in range(3)]
    db_session.add_all([site,*doctors]); db_session.commit()
    a,b,c = [p.id for p in doctors]
    root='/api/v1/schedules/'
    p={'date':'2026-11-01','facility_id':site.id,'first_call_md_id':a,'second_call_md_id':b}
    response=client.put(root+'manual/day',json=p,headers=daniel)
    assert response.status_code==200
    row_id=response.json()['id']
    assert len(client.get(root,headers=daniel).json())==1
    assert client.get(root,headers=admin).json()==[]
    for method,body in [('get',None),('put',{'md_ids':[b,c]}),('delete',None)]:
        kwargs={'headers':admin}
        if body: kwargs['json']=body
        assert getattr(client,method)(root+str(row_id),**kwargs).status_code==404
    # An account can save the same facility/date without overwriting the other.
    own=client.put(root+'manual/day',json={**p,'second_call_md_id':c},headers=admin)
    assert own.status_code==200 and own.json()['id'] != row_id
    assert client.get(root+str(row_id),headers=daniel).json()['md_ids']==[a,b]
    month={'facility_id':site.id,'year':2026,'month':11}
    assert client.post(root+'manual/blank-month',json=month,headers=daniel).status_code==200
    assert client.get(root+'manual/month-backup',params=month,headers=admin).json()=={'available':False}
    assert client.post(root+'manual/restore-month',json=month,headers=admin).status_code==404
    assert client.get(root,headers=admin).json()[0]['md_ids']==[a,c]
    assert client.post(root+'manual/blank-month',json=month,headers=admin).status_code==200
    assert client.post(root+'manual/restore-month',json=month,headers=daniel).status_code==200
    assert client.get(root,headers=admin).json()[0]['md_ids']==[]
    assert client.get(root,headers=daniel).json()[0]['md_ids']==[a,b]
