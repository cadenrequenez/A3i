from datetime import date as Date
from typing import Any, Dict, List, Optional, Literal, Annotated
from pydantic import Field, BaseModel, StringConstraints, field_validator


StaffName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


class StaffBase(BaseModel):
    name: StaffName
    active: bool = True
    pedi_qualified: bool = False
    cv_qualified: bool = False
    specialties: List[str] = []
    availability: Dict[str, Any] = {}


class MDCreate(StaffBase):
    pass


class MDUpdate(BaseModel):
    name: Optional[StaffName] = None
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


class StaffingValidation(BaseModel):
    @field_validator("staffing_requirements", check_fields=False)
    @classmethod
    def validate_staffing(cls, value):
        if value is None:
            return value
        for key in ("md", "crna"):
            if key in value and (type(value[key]) is not int or not 0 <= value[key] <= 100):
                raise ValueError("Staffing amounts must be whole numbers from 0 to 100")
        return value


class FacilityBase(StaffingValidation):
    site_name: str
    staffing_requirements: Dict[str, Any] = {}


class FacilityCreate(FacilityBase):
    pass


class FacilityUpdate(StaffingValidation):
    site_name: Optional[str] = None
    staffing_requirements: Optional[Dict[str, Any]] = None


class FacilityOut(FacilityBase):
    id: int

    class Config:
        from_attributes = True


class ScheduleBase(BaseModel):
    date: Date
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
    start_date: Date
    end_date: Date


class ScheduleAssignment(BaseModel):
    date: Date
    first_call_md_id: int | None = None
    second_call_md_id: int | None = None


class ScheduleViolationOut(BaseModel):
    code: str
    message: str
    date: Optional[Date] = None
    people: List[str] = []
    severity: str


class ScheduleValidationRequest(BaseModel):
    facility_id: Optional[int] = None
    year: Optional[int] = None
    month: Optional[int] = None
    start_date: Optional[Date] = None
    end_date: Optional[Date] = None
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
    back_to_back_first_count: int
    back_to_back_weekend_count: int
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
    start_date: Optional[Date] = None
    end_date: Optional[Date] = None
    schedule: Optional[List[ScheduleAssignment]] = None


class AISuggestionChange(BaseModel):
    date: Date
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
    focus_weekend_date: Optional[Date] = None
    max_suggestions: int = 3


class AISuggestedFixOut(BaseModel):
    title: str
    changes: List[AISuggestionChange]
    rationale: str
    why: str = ""
    impact_summary: str = ""
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
    username: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=80, pattern=r"^[a-zA-Z0-9._-]+$")]
    password: Annotated[str, StringConstraints(min_length=6, max_length=72)]
    role: Literal["admin", "read-only"]
    display_name: Optional[StaffName] = None
    title: Optional[StaffName] = None


class UserOut(BaseModel):
    id: int
    username: str
    role: str
    display_name: Optional[str] = None
    title: Optional[str] = None

    class Config:
        from_attributes = True


class ManualCallDay(BaseModel):
    date: Date
    facility_id: int
    first_call_md_id: int | None = None
    second_call_md_id: int | None = None
    first_call_guest_name: StaffName | None = None
    second_call_guest_name: StaffName | None = None
    expected_first_call_md_id: int | None = None
    expected_second_call_md_id: int | None = None
    expected_first_call_guest_name: StaffName | None = None
    expected_second_call_guest_name: StaffName | None = None
    off_md_ids: list[int] | None = None
    expected_off_md_ids: list[int] | None = None


class ManualMonthRequest(BaseModel):
    facility_id: int
    year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)


class TimeOffCreate(BaseModel):
    facility_id: int
    md_id: int
    start_date: Date
    end_date: Date

class TimeOffOut(TimeOffCreate):
    id: int
    class Config:
        from_attributes = True


class ManualCallDayOut(ScheduleOut):
    time_off_entries: list[TimeOffOut]
