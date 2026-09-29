from app import models
from app.tests.utils import create_user, get_auth_headers


def test_november_generation_recognizes_active_tim_cv_coverage(client, db_session):
    create_user(db_session, 'scheduler', 'secret', 'admin')
    headers = get_auth_headers(client, 'scheduler', 'secret')
    roster = [
        (13, 'Ricky Salinas', False), (14, 'Edward Requenez', True),
        (15, 'Daniel Requenez', True), (16, 'Erika Schwegler', True),
        (17, 'Mike Gorena', True), (18, 'Maria Lozano', False),
        (19, 'Jaime Garcia', True), (20, 'Clarissa Gutierrez', True),
        (22, 'Tim Castro', True),
    ]
    db_session.add(models.Facility(site_name='Rio Grande Regional Hospital'))
    for md_id, name, cv in roster:
        db_session.add(models.MD(id=md_id, name=name, cv_qualified=cv, pedi_qualified=False, active=True))
    db_session.commit()
    response = client.post('/api/v1/schedules/generate', headers=headers,
                           json={'year': 2026, 'month': 11, 'overwrite': False})
    assert response.status_code == 200, response.json()
    rows = db_session.query(models.Schedule).all()
    assert len(rows) == 30
    november_last = next(row for row in rows if row.date.day == 30)
    assert set(november_last.md_ids) == {13, 22}
    cv_ids = {md_id for md_id, _, cv in roster if cv}
    assert all(cv_ids.intersection(row.md_ids) for row in rows)
