export type ScheduleEntry = {
  id?: number;
  date: string;
  facility: string;
  mdIds: number[];
  crnaIds: number[];
  mdNames?: string[];
  crnaNames?: string[];
  callAssignments?: Record<string, number | null>;
  callFirstName?: string;
  callSecondName?: string;
};

export type FacilityColorMap = Record<string, string>;

export type StaffMember = {
  id: number;
  name: string;
  active?: boolean;
  pedi_qualified?: boolean;
  cv_qualified?: boolean;
};

export type Facility = {
  id: number;
  site_name: string;
  staffing_requirements?: Record<string, number>;
};

export type AISuggestionChange = {
  date: string;
  set_first_call_md_id: number;
  set_second_call_md_id: number;
};

export type AIFixSuggestion = {
  title: string;
  changes: AISuggestionChange[];
  rationale: string;
  expected_fairness_delta: number;
  actual_fairness_delta: number;
  violations_fixed: string[];
  violations_added: string[];
};

export type AIFixSuggestionsResponse = {
  suggestions: AIFixSuggestion[];
  baseline_violations: Array<{
    code: string;
    message: string;
    date?: string;
    people?: string[];
    severity: string;
  }>;
  baseline_score: {
    mean_score: number;
    stdev_score: number;
    min: number;
    max: number;
  };
};
