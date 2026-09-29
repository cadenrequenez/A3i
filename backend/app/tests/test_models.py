from datetime import date
from app import models
from app.tests.utils import create_user


def test_create_models(db_session):
    owner = create_user(db_session, "owner", "secret", "admin")
    md = models.MD(name="Dr. Gray", pedi_qualified=True, cv_qualified=False)
    crna = models.CRNA(name="Alex Nurse", pedi_qualified=True, cv_qualified=False)
    facility = models.Facility(site_name="Rio Hospital", staffing_requirements={"md": 2})
    schedule = models.Schedule(
        owner_id=owner.id,
        date=date(2026, 1, 1),
        facility=facility,
        md_ids=[1, 2],
        crna_ids=[],
        call_assignments={"first_call": 1, "second_call": 2},
    )

    db_session.add_all([md, crna, facility, schedule])
    db_session.commit()

    assert md.id is not None
    assert crna.id is not None
    assert facility.id is not None
    assert schedule.id is not None
