export type ScheduleEntry = {
  id?: number;
  date: string;
  facility: string;
  mdIds: number[];
  crnaIds: number[];
  callAssignments?: Record<string, number | null>;
};

export type FacilityColorMap = Record<string, string>;
