from datetime import date
from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class StaffBase(BaseModel):
    name: str
    active: bool = True
    pedi_qualified: bool = False
    cv_qualified: bool = False
    specialties: List[str] = []
    availability: Dict[str, Any] = {}


class MDCreate(StaffBase):
    pass


class MDUpdate(BaseModel):
    name: Optional[str] = None
    active: Optional[bool] = None
    pedi_qualified: Optional[bool] = None
    cv_qualified: Optional[bool] = None
    specialties: Optional[List[str]] = None
    availability: Optional[Dict[str, Any]] = None


class MDOut(StaffBase):
    id: int

    class Config:
        from_attributes = True


class CRNACreate(StaffBase):
    pass


class CRNAUpdate(MDUpdate):
    pass


class CRNAOut(StaffBase):
    id: int

    class Config:
        from_attributes = True


class FacilityBase(BaseModel):
    site_name: str
    staffing_requirements: Dict[str, Any] = {}


class FacilityCreate(FacilityBase):
    pass


class FacilityUpdate(BaseModel):
    site_name: Optional[str] = None
    staffing_requirements: Optional[Dict[str, Any]] = None


class FacilityOut(FacilityBase):
    id: int

    class Config:
        from_attributes = True


class ScheduleBase(BaseModel):
    date: date
    facility_id: int
    md_ids: List[int] = []
    crna_ids: List[int] = []
    call_assignments: Dict[str, Any] = {}


class ScheduleCreate(ScheduleBase):
    pass


class ScheduleUpdate(BaseModel):
    md_ids: Optional[List[int]] = None
    crna_ids: Optional[List[int]] = None
    call_assignments: Optional[Dict[str, Any]] = None


class ScheduleOut(ScheduleBase):
    id: int
    facility: Optional[FacilityOut] = None

    class Config:
        from_attributes = True


class ScheduleGenerateRequest(BaseModel):
    year: int
    month: int
    overwrite: bool = True
    max_on_call: Optional[int] = None
    max_surgical: Optional[int] = None


class ScheduleGenerateResponse(BaseModel):
    created: int
    start_date: date
    end_date: date


class ScheduleAssignment(BaseModel):
    date: date
    first_call_md_id: int | None = None
    second_call_md_id: int | None = None


class ScheduleViolationOut(BaseModel):
    code: str
    message: str
    date: Optional[date] = None
    people: List[str] = []
    severity: str


class ScheduleValidationRequest(BaseModel):
    facility_id: Optional[int] = None
    year: Optional[int] = None
    month: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    schedule: Optional[List[ScheduleAssignment]] = None


class ScheduleValidationResponse(BaseModel):
    ok: bool
    violations: List[ScheduleViolationOut]


class ScheduleScoreMdRow(BaseModel):
    md_id: int
    name: str
    first_call_count: int
    second_call_count: int
    weekend_count: int
    total_call: int
    score: float


class ScheduleScoreSummary(BaseModel):
    mean_score: float
    stdev_score: float
    min: float
    max: float


class ScheduleScoreResponse(BaseModel):
    per_md: List[ScheduleScoreMdRow]
    summary: ScheduleScoreSummary


class ScheduleScoreRequest(BaseModel):
    facility_id: Optional[int] = None
    year: Optional[int] = None
    month: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    schedule: Optional[List[ScheduleAssignment]] = None


class AISuggestionChange(BaseModel):
    date: date
    set_first_call_md_id: int
    set_second_call_md_id: int


class AISuggestedFixDraft(BaseModel):
    title: str
    changes: List[AISuggestionChange]
    rationale: str
    expected_fairness_delta: float


class AISuggestFixesRawResponse(BaseModel):
    suggestions: List[AISuggestedFixDraft] = []


class AISuggestFixesRequest(BaseModel):
    facility_id: int
    year: int
    month: int
    focus_weekend_date: Optional[date] = None
    max_suggestions: int = 3


class AISuggestedFixOut(BaseModel):
    title: str
    changes: List[AISuggestionChange]
    rationale: str
    expected_fairness_delta: float
    actual_fairness_delta: float
    violations_fixed: List[str] = []
    violations_added: List[str] = []
    remaining_violations: List[ScheduleViolationOut] = []


class AISuggestFixesResponse(BaseModel):
    suggestions: List[AISuggestedFixOut]
    baseline_violations: List[ScheduleViolationOut]
    baseline_score: ScheduleScoreSummary


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    username: str
    password: str
    role: str


class UserOut(BaseModel):
    id: int
    username: str
    role: str

    class Config:
        from_attributes = True
