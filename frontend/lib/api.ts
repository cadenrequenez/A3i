import type { AIFixSuggestionsResponse, Facility, ScheduleEntry, StaffMember } from "./types";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000").trim().replace(/\/+$/, "");

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

export async function fetchMds(token?: string): Promise<StaffMember[]> {
  const response = await fetch(`${API_URL}/api/v1/mds/?include_inactive=true`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error("Failed to load MDs");
  }
  return response.json();
}

export async function fetchCrnas(token?: string): Promise<StaffMember[]> {
  const response = await fetch(`${API_URL}/api/v1/crnas/`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error("Failed to load CRNAs");
  }
  return response.json();
}

export async function fetchFacilities(token?: string): Promise<Facility[]> {
  const response = await fetch(`${API_URL}/api/v1/facilities/`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error("Failed to load facilities");
  }
  return response.json();
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

export async function generateSchedule(
  year: number,
  month: number,
  overwrite: boolean,
  token?: string
) {
  const response = await fetch(`${API_URL}/api/v1/schedules/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ year, month, overwrite })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Failed to generate schedule");
  }
  return response.json();
}

export async function suggestScheduleFixes(
  facilityId: number,
  year: number,
  month: number,
  token?: string
): Promise<AIFixSuggestionsResponse> {
  const response = await fetch(`${API_URL}/api/v1/schedules/ai-suggest-fixes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ facility_id: facilityId, year, month, max_suggestions: 3 })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Failed to suggest fixes");
  }
  return response.json();
}
