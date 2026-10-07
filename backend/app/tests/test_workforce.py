from app import models
from app.tests.utils import create_user, get_auth_headers
ROOT='/api/v1/workforce/'


def setup(client,db):
    for name,role in [('dad','admin'),('other','admin'),('viewer','read-only')]:
        create_user(db,name,'secret',role)
    headers=get_auth_headers(client,'dad','secret')
    sites=[models.Facility(site_name=name,staffing_requirements={'md':1,'crna':1}) for name in ['Rio Grande','Driscoll']]
    md=models.MD(name='Rio doctor',active=True);crna=models.CRNA(name='Nurse',active=True)
    db.add_all([*sites,md,crna]);db.commit()
    config=client.get(ROOT+'settings',headers=headers).json()
    assert config['rosters'][str(sites[1].id)]==[]
    config['rosters'][str(sites[1].id)]=[{'key':'driscoll-doctor','name':'Pediatric doctor','active':True}]
    assert client.put(ROOT+'settings',headers=headers,json={'expected_revision':0,'rosters':config['rosters'],'crnas':config['crnas']}).status_code==200
    return headers,sites,md,crna


def entry(kind,key,site,**kw):
    return {'kind':kind,'key':key,'site_id':site,**kw}


def test_partial_drafts_transfer_history_and_isolation(client,db_session):
    h,sites,md,crna=setup(client,db_session);rio,driscoll=[s.id for s in sites];path=ROOT+'day/2026-10-01'
    p={'entries':[entry('md',f'md-{md.id}',rio),entry('crna',f'crna-{crna.id}',rio,home_site_id=rio,note='11am')],'note':'Unfinished'}
    r=client.put(path,headers=h,json={'expected_revision':0,'payload':p})
    assert r.status_code==200,r.text
    assert r.json()['revision']==1 and r.json()['warnings']
    assert db_session.query(models.Schedule).count()==0
    other=get_auth_headers(client,'other','secret')
    assert client.get(ROOT+'month?year=2026&month=10',headers=other).json()['days']==[]
    assert client.get(path+'/history',headers=other).json()==[]
    assert client.get(ROOT+'settings',headers=other).json()['rosters'][str(driscoll)]==[]
    assert client.put(path,headers=h,json={'expected_revision':0,'payload':p}).status_code==409
    p['entries'][1]['site_id']=driscoll
    moved=client.put(path,headers=h,json={'expected_revision':1,'payload':p}).json()
    assert moved['payload']['entries'][1]['home_site_id']==rio
    assert any('Rio Grande: 0/1 CRNA' in w for w in moved['warnings'])
    assert not any('Driscoll: 0/1 CRNA' in w for w in moved['warnings'])
    history=client.get(path+'/history',headers=h).json()
    assert history[0]['payload']['entries'][1]['site_id']==rio
    assert history[0]['payload']['entries'][1]['note']=='11am'
    assert client.put(path,headers=h,json={'expected_revision':2,'payload':history[0]['payload']}).json()['revision']==3
    viewer=get_auth_headers(client,'viewer','secret')
    assert client.put(path,headers=viewer,json={'expected_revision':0,'payload':{}}).status_code==403


def test_separate_rosters_guests_off_and_stale_settings(client,db_session):
    h,sites,md,crna=setup(client,db_session);rio,driscoll=[s.id for s in sites];path=ROOT+'day/2026-10-02'
    assert client.put(path,headers=h,json={'expected_revision':0,'payload':{'entries':[entry('md','driscoll-doctor',rio)]}}).status_code==422
    p={'entries':[entry('md','driscoll-doctor',driscoll),entry('md',None,rio,guest=True,name=' Temporary MD '),entry('md',f'md-{md.id}',None,status='off'),entry('crna',f'crna-{crna.id}',None,status='off')]}
    r=client.put(path,headers=h,json={'expected_revision':0,'payload':p})
    assert r.status_code==200,r.text
    assert r.json()['payload']['entries'][1]['name']=='Temporary MD'
    assert not db_session.query(models.MD).filter_by(name='Temporary MD').first()
    assert len([e for e in r.json()['payload']['entries'] if e['status']=='off'])==2
    config=client.get(ROOT+'settings',headers=h).json();config['crnas'][0]['active']=False
    for revision,status in [(0,409),(1,200)]:
        assert client.put(ROOT+'settings',headers=h,json={'expected_revision':revision,'rosters':config['rosters'],'crnas':config['crnas']}).status_code==status
    assert client.put(path,headers=h,json={'expected_revision':1,'payload':p}).status_code==200


def test_ready_requires_review_and_edits_invalidate(client,db_session):
    h,sites,md,crna=setup(client,db_session);status=ROOT+'month/2026/2/status'
    assert client.put(status,headers=h,json={'expected_revision':0,'status':'ready'}).status_code==422
    closed={str(s.id):{'closed':True,'note':'Closed'} for s in sites}
    for day in range(1,29):
        assert client.put(ROOT+f'day/2026-02-{day:02}',headers=h,json={'expected_revision':0,'payload':{'sites':closed,'reviewed':True}}).status_code==200
    assert client.put(status,headers=h,json={'expected_revision':0,'status':'ready'}).status_code==409
    revision=client.get(ROOT+'month?year=2026&month=2',headers=h).json()['revision']
    assert client.put(status,headers=h,json={'expected_revision':revision,'status':'ready'}).json()['status']=='ready'
    assert client.put(ROOT+'day/2026-02-01',headers=h,json={'expected_revision':1,'payload':{'sites':closed,'note':'Changed'}}).status_code==200
    assert client.get(ROOT+'month?year=2026&month=2',headers=h).json()['status']=='draft'


def test_duplicate_off_is_warning_and_draft_saves(client,db_session):
    h,sites,md,crna=setup(client,db_session)
    p={'entries':[entry('md',f'md-{md.id}',sites[0].id),entry('md',f'md-{md.id}',None,status='off')]}
    r=client.put(ROOT+'day/2026-10-03',headers=h,json={'expected_revision':0,'payload':p})
    assert r.status_code==200 and any('more than once' in w for w in r.json()['warnings'])
