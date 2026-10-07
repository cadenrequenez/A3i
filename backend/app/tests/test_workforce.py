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


def test_rio_team_changes_sync_private_workforce_without_changing_saved_days(client, db_session):
    h, sites, md, crna = setup(client, db_session)
    rio, driscoll = [s.id for s in sites]
    other = get_auth_headers(client, 'other', 'secret')
    other_config = client.get(ROOT + 'settings', headers=other).json()
    assert client.put(ROOT + 'settings', headers=other, json={
        'expected_revision': 0, 'rosters': other_config['rosters'], 'crnas': other_config['crnas']
    }).status_code == 200
    day = ROOT + 'day/2026-10-04'
    assert client.put(day, headers=h, json={'expected_revision': 0, 'payload': {
        'entries': [entry('md', f'md-{md.id}', rio)]
    }}).status_code == 200
    r = client.put(f'/api/v1/mds/{md.id}', headers=h, json={'name': 'Updated Rio doctor', 'active': False})
    assert r.status_code == 200, r.text
    config = client.get(ROOT + 'settings', headers=h).json()
    assert config['revision'] == 2
    assert config['rosters'][str(rio)][0] == {'key': f'md-{md.id}', 'name': 'Updated Rio doctor', 'active': False}
    assert config['rosters'][str(driscoll)] == [{'key': 'driscoll-doctor', 'name': 'Pediatric doctor', 'active': True}]
    unchanged = client.get(ROOT + 'settings', headers=other).json()
    assert unchanged['revision'] == 1
    assert unchanged['rosters'][str(rio)][0]['name'] == 'Rio doctor'
    saved = client.get(ROOT + 'month?year=2026&month=10', headers=h).json()['days'][0]
    assert saved['revision'] == 1 and saved['payload']['entries'][0]['name'] == 'Rio doctor'
    assert client.put(ROOT + 'settings', headers=h, json={
        'expected_revision': 1, 'rosters': config['rosters'], 'crnas': config['crnas']
    }).status_code == 409
    added = client.post('/api/v1/mds/', headers=h, json={'name': 'New Rio MD', 'active': True}).json()
    updated = client.get(ROOT + 'settings', headers=h).json()
    assert updated['revision'] == 3
    assert any(m['key'] == f'md-{added["id"]}' for m in updated['rosters'][str(rio)])
    assert updated['rosters'][str(driscoll)] == config['rosters'][str(driscoll)]
    assert db_session.query(models.Schedule).count() == 0


def test_home_crnas_and_post_call(client, db_session):
    h, sites, md, crna = setup(client, db_session)
    rio, driscoll = [s.id for s in sites]
    config = client.get(ROOT+'settings', headers=h).json()
    config['site_crnas'] = {str(driscoll): [{'key':'dris-crna','name':'Pediatric nurse','active':True}]}
    assert client.put(ROOT+'settings', headers=h, json={'expected_revision':1, **{k:config[k] for k in ['rosters','crnas','site_crnas']}}).status_code == 200
    assert client.put(ROOT+'settings', headers=h, json={'expected_revision':2,'rosters':config['rosters'],'crnas':config['crnas']}).json()['site_crnas'] == config['site_crnas']
    assert client.put(ROOT+'settings', headers=h, json={'expected_revision':3,'rosters':config['rosters'],'crnas':config['crnas'],'site_crnas':{str(driscoll):config['crnas']}}).status_code == 422
    payload={'entries':[entry('md',f'md-{md.id}',rio),entry('md',f'md-{md.id}',rio,status='post_call'),entry('crna','dris-crna',driscoll,home_site_id=driscoll)]}
    r=client.put(ROOT+'day/2026-10-01',headers=h,json={'expected_revision':0,'payload':payload})
    assert r.status_code == 200, r.text
    assert not any('more than once' in w or 'Rio Grande: 2/1 MD' in w for w in r.json()['warnings'])
    assert r.json()['payload']['entries'][1]['status']=='post_call'
    assert client.put(ROOT+'day/2026-10-02',headers=h,json={'expected_revision':0,'payload':{'entries':[entry('crna',f'crna-{crna.id}',rio,status='post_call')]}}).status_code==422


def test_issued_privacy_immutability_and_isolation(client, db_session):
    import json
    h,sites,md,crna=setup(client,db_session)
    rio,driscoll=[s.id for s in sites]
    payload={'entries':[entry('md',f'md-{md.id}',rio,note='Private timing'),entry('md','driscoll-doctor',driscoll),entry('md',None,None,status='off',guest=True,name='Secret off name'),entry('crna',f'crna-{crna.id}',driscoll,home_site_id=rio,note='11am'),entry('crna',None,driscoll,home_site_id=driscoll,guest=True,name='Regular Driscoll nurse')],'note':'Private office comment','sites':{str(rio):{'note':'Private site note'}}}
    assert client.put(ROOT+'day/2026-10-01',headers=h,json={'expected_revision':0,'payload':payload}).status_code==200
    path=ROOT+'issues/2026/10'
    hospital=client.put(path,headers=h,json={'expected_revision':1,'section':str(rio)}).json()
    for secret in ['Secret off name','Private timing','Private office comment','Private site note','Pediatric doctor','Regular Driscoll nurse']:
        assert secret not in json.dumps(hospital)
    assert len(hospital['snapshot']['sites'])==1 and hospital['snapshot']['sites'][0]['id']==rio
    assert hospital['snapshot']['month']['days'][0]['payload']['entries'][0]['home_site_id'] is None
    provider=client.put(path,headers=h,json={'expected_revision':1,'section':str(rio),'audience':'provider','include_notes':True}).json()
    assert 'Private timing' in json.dumps(provider) and 'Secret off name' not in json.dumps(provider) and 'Private office comment' not in json.dumps(provider)
    office=client.put(path,headers=h,json={'expected_revision':1,'section':str(rio),'audience':'office'}).json()
    assert 'Secret off name' in json.dumps(office) and 'Private office comment' in json.dumps(office)
    relief=client.put(path,headers=h,json={'expected_revision':1,'section':'relief','audience':'provider'}).json()
    assert 'Nurse' in json.dumps(relief) and 'Regular Driscoll nurse' not in json.dumps(relief) and 'Secret off name' not in json.dumps(relief)
    assert client.put(path,headers=h,json={'expected_revision':1,'section':'relief','audience':'hospital'}).status_code==422
    assert client.put(ROOT+'day/2026-10-01',headers=h,json={'expected_revision':1,'payload':{}}).status_code==200
    rows=client.get(ROOT+'issues?year=2026&month=10',headers=h).json()
    assert next(r for r in rows if r['id']==hospital['id'])==hospital
    assert client.put(path,headers=h,json={'expected_revision':1,'section':str(rio)}).status_code==409
    next_issue=client.put(path,headers=h,json={'expected_revision':2,'section':str(rio)}).json()
    assert next_issue['revision']==2 and next_issue['snapshot']['month']['days'][0]['payload']['entries']==[]
    other=get_auth_headers(client,'other','secret')
    assert client.get(ROOT+'issues?year=2026&month=10',headers=other).json()==[]
    viewer=get_auth_headers(client,'viewer','secret')
    assert client.get(ROOT+'issues?year=2026&month=10',headers=viewer).status_code==403
    assert client.put(path,headers=viewer,json={'expected_revision':0,'section':str(rio)}).status_code==403
