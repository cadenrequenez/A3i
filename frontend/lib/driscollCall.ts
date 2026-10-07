import { fetchApi } from "./api";
import type { ScheduleEntry } from "./types";
export type CallChoice = { key: string | null; guest_name: string | null };
export type DriscollCalls = {
  revision?: number;
  first_call_key?: string | null; second_call_key?: string | null;
  first_call_name?: string | null; second_call_name?: string | null;
  first_call_guest_name?: string | null; second_call_guest_name?: string | null;
  off_keys?: string[]; off_names?: string[];
};
export const driscollCalls = (entry?: ScheduleEntry): DriscollCalls => (entry?.callAssignments || {}) as DriscollCalls;
export async function saveDriscollCallDay(body: {
  date: string; facility_id: number; expected_revision: number;
  first: CallChoice; second: CallChoice; off_keys: string[];
}, token?: string): Promise<ScheduleEntry> {
  const response = await fetchApi("/api/v1/schedules/driscoll/day", {
    method: "PUT", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.detail === "string" ? data.detail : response.status === 404 ? "The Driscoll update is still deploying. Your edits are still here; try saving again shortly." : "Unable to save this day. Your edits are still here. Please try again.");
  return { id: data.id, date: data.date, facility: data.facility.site_name, mdIds: data.md_ids, crnaIds: data.crna_ids, callAssignments: data.call_assignments };
}
