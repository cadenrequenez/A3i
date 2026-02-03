import type { ScheduleEntry } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function fetchSchedules(token?: string): Promise<ScheduleEntry[]> {
  const response = await fetch(`${API_URL}/api/v1/schedules/`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error("Failed to load schedules");
  }
  const data = await response.json();
  return data.map((item: any) => ({
    id: item.id,
    date: item.date,
    facility: item.facility?.site_name ?? item.facility,
    mdIds: item.md_ids ?? [],
    crnaIds: item.crna_ids ?? [],
    callAssignments: item.call_assignments
  }));
}

export async function updateSchedule(
  scheduleId: number,
  payload: Partial<ScheduleEntry>,
  token?: string
) {
  const response = await fetch(`${API_URL}/api/v1/schedules/${scheduleId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      md_ids: payload.mdIds,
      crna_ids: payload.crnaIds,
      call_assignments: payload.callAssignments
    })
  });

  if (!response.ok) {
    throw new Error("Failed to update schedule");
  }
  return response.json();
}
