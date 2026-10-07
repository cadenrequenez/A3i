import { fetchApi } from "./api";
export type RosterMember = { key: string; name: string; active: boolean };
export type WorkforceSettings = {
  revision: number;
  rosters: Record<string, RosterMember[]>;
  crnas: RosterMember[];
  site_crnas?: Record<string, RosterMember[]>;
};
export type WorkforceEntry = {
  kind: "md" | "crna";
  key: string | null;
  name: string;
  guest: boolean;
  site_id: number | null;
  home_site_id: number | null;
  status: "working" | "off" | "admin" | "post_call";
  note: string;
};
export type WorkforceSiteDay = {
  closed: boolean;
  md: number | null;
  crna: number | null;
  note: string;
};
export type WorkforcePayload = {
  entries: WorkforceEntry[];
  sites: Record<string, WorkforceSiteDay>;
  note: string;
  reviewed: boolean;
};
export type WorkforceDay = {
  date: string;
  revision: number;
  payload: WorkforcePayload;
  updated_at: string;
  warnings: string[];
  month_revision?: number;
};
export type WorkforceMonth = {
  year: number;
  month: number;
  revision: number;
  status: "draft" | "ready";
  days: WorkforceDay[];
};
export type WorkforceHistory = {
  revision: number;
  payload: WorkforcePayload;
  created_at: string;
};
export type WorkforceAudience = "hospital" | "provider" | "office";
export type WorkforceIssue = {
  id: number;
  year: number;
  month: number;
  section: string;
  audience: WorkforceAudience;
  revision: number;
  created_at: string;
  snapshot: { month: WorkforceMonth; sites: Facility[] };
};
import type { Facility } from "./types";

export function workforceCopy(
  month: WorkforceMonth,
  sites: Facility[],
  section: string,
  audience: WorkforceAudience,
  includeNotes = false,
) {
  const copy = structuredClone(month),
    driscoll = sites
      .filter((s) => /driscoll/i.test(s.site_name))
      .map((s) => s.id);
  const selected =
    section === "relief"
      ? sites
      : sites.filter((s) => String(s.id) === section);
  if (section === "relief" && audience === "hospital")
    throw new Error("Choose a site for a hospital copy.");
  for (const day of copy.days) {
    day.payload.entries = day.payload.entries
      .filter((e) => {
        if (e.status === "off") return audience === "office";
        if (e.status === "admin" && audience !== "office") return false;
        return section === "relief"
          ? e.kind === "crna" &&
              !driscoll.includes(e.home_site_id ?? e.site_id ?? -1)
          : String(e.site_id) === section;
      })
      .map((e) =>
        audience === "office"
          ? e
          : {
              ...e,
              key: null,
              guest: true,
              home_site_id: null,
              note: includeNotes ? e.note : "",
            },
      );
    day.payload.sites = Object.fromEntries(
      selected.map((s) => [
        String(s.id),
        {
          ...(day.payload.sites[s.id] || {
            closed: false,
            md: null,
            crna: null,
            note: "",
          }),
          ...(!includeNotes && audience !== "office" ? { note: "" } : {}),
        },
      ]),
    );
    if (audience !== "office") {
      day.payload.note = "";
      day.warnings = [];
    }
  }
  return { month: copy, sites: selected };
}
export const emptyWorkforceDay = (): WorkforcePayload => ({
  entries: [],
  sites: {},
  note: "",
  reviewed: false,
});
export const normalizeWorkforceDay = (
  p?: Partial<WorkforcePayload>,
): WorkforcePayload => ({ ...emptyWorkforceDay(), ...p });
export async function workforceRequest<T>(
  path: string,
  token: string | undefined,
  body?: unknown,
): Promise<T> {
  const response = await fetchApi(`/api/v1/workforce/${path}`, {
    method: body ? "PUT" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : response.status === 404
          ? "The workforce update is still deploying. Please try again shortly."
          : "Unable to save. Your edits are still here. Please try again.",
    );
  return data;
}
export const workforceDate = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
