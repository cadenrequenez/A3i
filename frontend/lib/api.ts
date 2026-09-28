import type {
  AIFixSuggestionsResponse,
  Facility,
  ScheduleEntry,
  ScheduleScoreResponse,
  StaffMember
} from "./types";

import { API_BASE_URL } from "./connection";

async function fetchApi(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  if (response.status === 401 && typeof window !== "undefined") {
    localStorage.removeItem("a3i_token");
    localStorage.removeItem("a3i_role");
    document.cookie = "a3i_token=; path=/; Max-Age=0";
    document.cookie = "a3i_role=; path=/; Max-Age=0";
    window.location.assign("/login?session=expired");
    throw new Error("Your session has expired. Please sign in again.");
  }
  return response;
}

export async function fetchSchedules(token?: string): Promise<ScheduleEntry[]> {
  const response = await fetchApi(`/api/v1/schedules/`, {
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
  const response = await fetchApi(`/api/v1/mds/?include_inactive=true`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error("Failed to load MDs");
  }
  return response.json();
}

export async function fetchCrnas(token?: string): Promise<StaffMember[]> {
  const response = await fetchApi(`/api/v1/crnas/?include_inactive=true`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error("Failed to load CRNAs");
  }
  return response.json();
}

export async function fetchFacilities(token?: string): Promise<Facility[]> {
  const response = await fetchApi(`/api/v1/facilities/`, {
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
  const response = await fetchApi(`/api/v1/schedules/${scheduleId}`, {
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
  const response = await fetchApi(`/api/v1/schedules/generate`, {
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
  const response = await fetchApi(`/api/v1/schedules/ai-suggest-fixes`, {
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

export async function scoreSchedule(
  facilityId: number,
  year: number,
  month: number,
  token?: string
): Promise<ScheduleScoreResponse> {
  const response = await fetchApi(`/api/v1/schedules/score`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ facility_id: facilityId, year, month })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Failed to load score analytics");
  }
  return response.json();
}

export async function saveStaff(kind: "mds" | "crnas", person: Partial<StaffMember>, token?: string): Promise<StaffMember> {
  const { id, name, active, pedi_qualified, cv_qualified } = person;
  const response = await fetchApi(`/api/v1/${kind}/${id ?? ""}`, {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, active, pedi_qualified, cv_qualified })
  });
  if (!response.ok) throw new Error("Staff changes could not be saved. Your edits are still here; please try again.");
  return response.json();
}

export type AccountProfile = { username: string; display_name?: string; title?: string; role: string };
export async function fetchProfile(token?: string): Promise<AccountProfile> {
 const response = await fetchApi('/api/v1/auth/me', {headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
 if (!response.ok) throw new Error('Unable to load your profile.');
 return response.json();
}
export async function saveStaffing(site: Facility, md: number, crna: number, token?: string): Promise<Facility> {
 const response = await fetchApi(`/api/v1/facilities/${site.id}`, {method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({staffing_requirements:{...site.staffing_requirements,md,crna}})});
 if(!response.ok) throw new Error('Staffing amounts could not be saved. Please try again.');
 return response.json();
}
