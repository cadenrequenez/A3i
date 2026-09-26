"use client";

import { useEffect, useMemo, useState } from "react";
import Calendar from "./Calendar";
import type { AIFixSuggestion, ScheduleEntry } from "../lib/types";
import {
  fetchFacilities,
  fetchMds,
  fetchSchedules,
  generateSchedule,
  suggestScheduleFixes,
  updateSchedule
} from "../lib/api";
import { getRole, getToken } from "../lib/auth";

const RIO_FACILITY = "Rio Grande Regional Hospital";

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function ScheduleBoard() {
  const todayIso = formatIsoDate(new Date());
  const [view, setView] = useState<"month" | "day">("month");
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [month, setMonth] = useState(Number(todayIso.slice(5, 7)));
  const [year, setYear] = useState(Number(todayIso.slice(0, 4)));
  const [overwrite, setOverwrite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [generating,setGenerating] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "read-only">("read-only");
  const [inactiveMdIds, setInactiveMdIds] = useState<number[]>([]);
  const [mdMap, setMdMap] = useState<Record<number, string>>({});
  const [editCallFirst, setEditCallFirst] = useState<number | null>(null);
  const [editCallSecond, setEditCallSecond] = useState<number | null>(null);
  const [isGeneratingYear, setIsGeneratingYear] = useState(false);
  const [rioFacilityId, setRioFacilityId] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<AIFixSuggestion[]>([]);
  const [suggestionStatus, setSuggestionStatus] = useState<string | null>(null);
  const [applyingSuggestionIndex, setApplyingSuggestionIndex] = useState<number | null>(null);

  const loadSchedules = () => {
    const token = getToken();
    return fetchSchedules(token)
      .then((data) => {
        const rioOnly = data.filter((entry) => entry.facility === RIO_FACILITY);
        const hydrated = rioOnly.map((entry) => {
          const firstId = entry.callAssignments?.first_call_md_id ?? null;
          const secondId = entry.callAssignments?.second_call_md_id ?? null;
          return {
            ...entry,
            mdNames: entry.mdIds.map((id) => mdMap[id]).filter(Boolean),
            callFirstName: firstId ? mdMap[firstId] || String(firstId) : undefined,
            callSecondName: secondId ? mdMap[secondId] || String(secondId) : undefined
          };
        });
        setSchedules(hydrated);
        if (hydrated.length > 0 && !hydrated.some((entry) => entry.date === selectedDate)) {
          const firstDate = hydrated[0].date;
          setSelectedDate(firstDate);
          setMonth(Number(firstDate.slice(5, 7)));
          setYear(Number(firstDate.slice(0, 4)));
        }
      })
      .catch((error) => { setStatus((error as Error).message); throw error; });
  };


  useEffect(() => {
    setRole(getRole());
    const token = getToken();
    Promise.all([fetchMds(token), fetchFacilities(token)])
      .then(([mds, facilities]) => {
        const mdLookup: Record<number, string> = {};
        mds.forEach((md) => {
          mdLookup[md.id] = md.name;
        });
        setMdMap(mdLookup);
        setInactiveMdIds(mds.filter(md => md.active === false).map(md => md.id));
        const rioFacility = facilities.find((item) => item.site_name === RIO_FACILITY);
        setRioFacilityId(rioFacility?.id ?? null);
      })
      .then(() => loadSchedules())
      .catch((error) => setStatus((error as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const hydratedSchedules = useMemo(
    () =>
      schedules
        .filter((entry) => entry.facility === RIO_FACILITY)
        .map((entry) => {
          const firstId = entry.callAssignments?.first_call_md_id ?? null;
          const secondId = entry.callAssignments?.second_call_md_id ?? null;
          return {
            ...entry,
            mdNames: entry.mdIds.map((id) => mdMap[id]).filter(Boolean),
            callFirstName: firstId ? mdMap[firstId] || String(firstId) : undefined,
            callSecondName: secondId ? mdMap[secondId] || String(secondId) : undefined
          };
        }),
    [schedules, mdMap]
  );

  const daySchedules = useMemo(
    () => hydratedSchedules.filter((entry) => entry.date === selectedDate),
    [hydratedSchedules, selectedDate]
  );

  useEffect(() => {
    const entry = hydratedSchedules.find((item) => item.date === selectedDate);
    if (entry?.callAssignments) {
      setEditCallFirst(entry.callAssignments.first_call_md_id ?? null);
      setEditCallSecond(entry.callAssignments.second_call_md_id ?? null);
    } else { setEditCallFirst(null); setEditCallSecond(null); }
  }, [selectedDate, hydratedSchedules]);

  const shiftMonth = (delta: number) => {
    const current = parseIsoDate(selectedDate);
    current.setDate(1);
    current.setMonth(current.getMonth() + delta);
    const nextDate = formatIsoDate(current);
    setSelectedDate(nextDate);
    setMonth(Number(nextDate.slice(5, 7)));
    setYear(Number(nextDate.slice(0, 4)));
    setView("month");
  };

  const generateFullYear = async () => {
    const token = getToken() || undefined;
    if (!token) {
      setStatus("Missing auth token.");
      return;
    }
    if (!window.confirm(`Generate all 12 months of ${year}? ${overwrite ? "Existing schedules will be replaced." : "Existing schedules will be kept."}`)) return;
    setIsGeneratingYear(true);
    setStatus(`Generating all months for ${year}...`);
    try {
      for (let m = 1; m <= 12; m += 1) {
        await generateSchedule(year, m, overwrite, token);
      }
      await loadSchedules();
      setSelectedDate(`${year}-01-01`);
      setMonth(1);
      setView("month");
      setStatus(`Generated schedule for all 12 months of ${year}.`);
    } catch (error) {
      setStatus((error as Error).message || "Failed to generate full year.");
    } finally {
      setIsGeneratingYear(false);
    }
  };

  const postCallName = useMemo(() => {
    const currentDate = parseIsoDate(selectedDate);
    currentDate.setDate(currentDate.getDate() - 1);
    const priorDate = formatIsoDate(currentDate);
    const priorEntry = hydratedSchedules.find((entry) => entry.date === priorDate);
    const postCallId = priorEntry?.callAssignments?.first_call_md_id;
    if (!postCallId) {
      return "TBD";
    }
    return mdMap[postCallId] || String(postCallId);
  }, [selectedDate, hydratedSchedules, mdMap]);


  const monthLabel = new Date(year,month-1,1).toLocaleDateString(undefined,{month:"long",year:"numeric"});
  const selectedLabel = parseIsoDate(selectedDate).toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"});
  async function generateMonth(){
    if(overwrite && !window.confirm(`Replace the saved schedule for ${monthLabel}?`))return;
    setGenerating(true);setStatus(null);
    try {await generateSchedule(year,month,overwrite,getToken());await loadSchedules();setStatus(`Schedule generated for ${monthLabel}.`);}
    catch(error){setStatus((error as Error).message);}finally{setGenerating(false);}
  }
  async function saveCall(){
    if(!editCallFirst||!editCallSecond||editCallFirst===editCallSecond){setStatus("Choose two different doctors before saving.");return;}
    setSaving(true);setStatus(null);
    try { const row=daySchedules[0];if(!row?.id)throw new Error("No saved assignment exists for this date.");
      await updateSchedule(row.id,{callAssignments:{first_call_md_id:editCallFirst,second_call_md_id:editCallSecond}},getToken());
      await loadSchedules();setStatus("Call assignments saved.");
    }catch(error){setStatus((error as Error).message);}finally{setSaving(false);}
  }
  return <div className="schedule-workspace">
    <header className="schedule-heading"><div><p className="eyebrow">{RIO_FACILITY}</p><h1>{monthLabel}</h1></div>
     <div className="schedule-navigation"><div className="view-toggle"><button aria-pressed={view==="month"} onClick={()=>setView("month")}>Month</button><button aria-pressed={view==="day"} onClick={()=>setView("day")}>Day</button></div>
      <button aria-label="Previous month" onClick={()=>shiftMonth(-1)}>‹</button><button onClick={()=>{setSelectedDate(todayIso);setMonth(Number(todayIso.slice(5,7)));setYear(Number(todayIso.slice(0,4)));setView("month");}}>Today</button><button aria-label="Next month" onClick={()=>shiftMonth(1)}>›</button>
     </div>
    </header>
    <div className="schedule-body">
     {status && <p role="status" className="status-message">{status}</p>}
     {loading && <p role="status" className="status-message">Loading your saved schedule…</p>}
     <div className={`schedule-layout ${view==="day"?"day-view":""}`}>
      <div className="schedule-calendar-area">{view==="day"?<div className="day-overview surface-card"><button className="text-button" onClick={()=>setView("month")}>← Back to month</button><p className="eyebrow mt-6">Daily coverage</p><h2>{selectedLabel}</h2><p className="mt-2 text-sm text-slate-600">{RIO_FACILITY}</p><div className="day-call-summary"><div><span>First call</span><strong>{daySchedules[0]?.callFirstName||"Unassigned"}</strong></div><div><span>Second call</span><strong>{daySchedules[0]?.callSecondName||"Unassigned"}</strong></div><div><span>Post call</span><strong>{postCallName==="TBD"?"Not available":postCallName}</strong></div></div></div>:<Calendar schedules={hydratedSchedules} view="month" selectedDate={selectedDate} onSelectDate={date=>{setSelectedDate(date);if(window.matchMedia("(max-width: 700px)").matches)setView("day");}}/>}
      </div>
      <aside className="schedule-detail" aria-label="Selected day">
       <section className="detail-card"><p className="eyebrow">Selected day</p><h2>{selectedLabel}</h2><label className="field-label" htmlFor="schedule-date">Go to date</label><input id="schedule-date" type="date" value={selectedDate} onChange={e=>{if(!e.target.value)return;setSelectedDate(e.target.value);setMonth(Number(e.target.value.slice(5,7)));setYear(Number(e.target.value.slice(0,4)));}}/>
        {daySchedules.length===0?<p className="empty-note">No saved coverage for this day. Use planning tools to create a schedule.</p>:<><label className="field-label" htmlFor="first-call">First-call doctor</label><select id="first-call" disabled={role!=="admin"||saving} value={editCallFirst??""} onChange={e=>setEditCallFirst(Number(e.target.value)||null)}><option value="">Choose a doctor</option>{Object.entries(mdMap).map(([id,name])=><option key={id} value={id} disabled={inactiveMdIds.includes(Number(id))}>{name}{inactiveMdIds.includes(Number(id)) ? " (inactive)" : ""}</option>)}</select><label className="field-label" htmlFor="second-call">Second-call doctor</label><select id="second-call" disabled={role!=="admin"||saving} value={editCallSecond??""} onChange={e=>setEditCallSecond(Number(e.target.value)||null)}><option value="">Choose a doctor</option>{Object.entries(mdMap).map(([id,name])=><option key={id} value={id} disabled={inactiveMdIds.includes(Number(id))}>{name}{inactiveMdIds.includes(Number(id)) ? " (inactive)" : ""}</option>)}</select>{role==="admin"?<button className="primary-button mt-5 w-full" disabled={saving||loading} onClick={saveCall}>{saving?"Saving…":"Save changes"}</button>:<p className="empty-note">View-only access</p>}</>}
       </section>
       {role==="admin"&&<details className="planning-tools"><summary>Planning tools <span aria-hidden="true">+</span></summary><div className="planning-content"><p>Generate coverage for <strong>{monthLabel}</strong>. Review the saved result before using it.</p><label className="flex items-center gap-2"><input type="checkbox" checked={overwrite} onChange={e=>setOverwrite(e.target.checked)}/>Replace existing assignments</label><button className="primary-button" disabled={generating||isGeneratingYear||loading} onClick={generateMonth}>{generating?"Generating…":"Generate month"}</button><button className="secondary-button" disabled={generating||isGeneratingYear||loading} onClick={generateFullYear}>{isGeneratingYear?"Generating year…":`Generate ${year}`}</button><button className="secondary-button" disabled={!rioFacilityId||generating||isGeneratingYear} onClick={async()=>{setSuggestionStatus("Checking for suggestions…");try{const result=await suggestScheduleFixes(rioFacilityId!,year,month,getToken());setSuggestions(result.suggestions);setSuggestionStatus(result.suggestions.length?`${result.suggestions.length} suggestions ready to review.`:"No valid suggestions returned.");}catch(e){setSuggestionStatus((e as Error).message);}}}>Review suggestions</button></div></details>}
      </aside>
     </div>
     {suggestionStatus&&<p role="status" className="status-message">{suggestionStatus}</p>}
      {suggestions.length > 0 && (
        <div className="surface-card rounded-xl p-4">
          <h3 className="text-lg font-semibold">AI Suggestions Preview</h3>
          <p className="mt-1 text-sm text-slate-600">Preview only. Suggestions are not saved automatically.</p>
          <div className="mt-3 space-y-3">
            {suggestions.map((item, index) => (
              <div key={`${item.title}-${index}`} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                <p className="font-semibold">{item.title}</p>
                <p className="text-slate-600">{item.rationale}</p>
                {item.why && <p className="mt-1 text-xs text-slate-600">{item.why}</p>}
                {item.impact_summary && (
                  <p className="mt-1 text-xs text-slate-600">
                    <span className="font-medium">Impact:</span> {item.impact_summary}
                  </p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  Expected delta: {item.expected_fairness_delta.toFixed(3)} | Actual delta: {item.actual_fairness_delta.toFixed(3)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Fixed: {item.violations_fixed.join(", ") || "none"} | Added: {item.violations_added.join(", ") || "none"}
                </p>
                <ul className="mt-2 list-disc pl-5 text-xs text-slate-600">
                  {item.changes.map((change) => (
                    <li key={`${change.date}-${change.set_first_call_md_id}-${change.set_second_call_md_id}`}>
                      {change.date}: 1st {mdMap[change.set_first_call_md_id] || change.set_first_call_md_id}, 2nd{" "}
                      {mdMap[change.set_second_call_md_id] || change.set_second_call_md_id}
                    </li>
                  ))}
                </ul>
                {role === "admin" && (
                  <button
                    className="mt-3 rounded bg-slate-900 px-3 py-1 text-xs text-white disabled:opacity-50"
                    disabled={applyingSuggestionIndex === index}
                    onClick={async () => {
                      setApplyingSuggestionIndex(index);
                      setSuggestionStatus(null);
                      try {
                        const token = getToken() || undefined;
                        for (const change of item.changes) {
                          const target = hydratedSchedules.find((entry) => entry.date === change.date && entry.id);
                          if (!target?.id) {
                            throw new Error(`Missing schedule row for ${change.date}`);
                          }
                          await updateSchedule(
                            target.id,
                            {
                              callAssignments: {
                                first_call_md_id: change.set_first_call_md_id,
                                second_call_md_id: change.set_second_call_md_id
                              }
                            },
                            token
                          );
                        }
                        await loadSchedules();
                        setSuggestionStatus("Suggestion applied. Schedule updated.");
                      } catch (error) {
                        setSuggestionStatus((error as Error).message || "Failed to apply suggestion.");
                      } finally {
                        setApplyingSuggestionIndex(null);
                      }
                    }}
                  >
                    {applyingSuggestionIndex === index ? "Applying..." : "Apply suggestion"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  </div>;
}
