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
