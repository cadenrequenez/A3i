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
    const data = await response.json().catch(()=>null);
    const detail = data?.detail;
    const reasons = Array.isArray(detail?.violations) ? detail.violations.slice(0,3).map((item:any)=>`${item.date || ""} ${item.message}`).join("; ") : "";
    throw new Error(reasons ? `Automatic generation could not satisfy the rules: ${reasons}. You can still assign and save days yourself.` : typeof detail === "string" ? detail : "Automatic generation could not finish. You can assign and save days yourself, or try again.");
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

export async function saveManualCallDay(payload: {date:string;facility_id:number;first_call_md_id:number|null;second_call_md_id:number|null;expected_first_call_md_id:number|null;expected_second_call_md_id:number|null;first_call_guest_name?:string|null;second_call_guest_name?:string|null;expected_first_call_guest_name?:string|null;expected_second_call_guest_name?:string|null;off_md_ids?:number[];expected_off_md_ids?:number[]}, token?:string) {
 const response = await fetchApi('/api/v1/schedules/manual/day',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(payload)});
 const data = await response.json().catch(()=>null);
 if(!response.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : 'This day could not be saved. Your selections are still here; please try again.');
 return data;
}

export async function hasMonthBackup(facility: number, year: number, month: number, token?: string): Promise<boolean> {
 const response = await fetchApi(`/api/v1/schedules/manual/month-backup?facility_id=${facility}&year=${year}&month=${month}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
 if(!response.ok) throw new Error('Unable to check the saved previous version.');
 return (await response.json()).available;
}
export async function changeManualMonth(action: 'blank'|'restore', facility: number, year: number, month: number, token?: string) {
 const response = await fetchApi(`/api/v1/schedules/manual/${action==='blank'?'blank-month':'restore-month'}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({facility_id:facility,year,month})});
 const result = await response.json();
 if(!response.ok) throw new Error(typeof result.detail==='string'?result.detail:'The month could not be changed. Please try again.');
 return result;
}


export type TimeOff = {id:number;facility_id:number;md_id:number;start_date:string;end_date:string};
export async function timeOffRequest(facility:number, token:string|undefined, entry?:Omit<TimeOff,'id'>, removeId?:number):Promise<TimeOff[]|TimeOff> {
 const path=removeId?`/manual/time-off/${removeId}`:'/manual/time-off';
 const response=await fetchApi(`/api/v1/schedules${path}${!entry&&!removeId?`?facility_id=${facility}`:''}`,{method:removeId?'DELETE':entry?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},...(entry?{body:JSON.stringify(entry)}:{}),cache:'no-store'});
 const result=await response.json();if(!response.ok)throw new Error(typeof result.detail==='string'?result.detail:'Unable to save time off. Please try again.');return result;
}
