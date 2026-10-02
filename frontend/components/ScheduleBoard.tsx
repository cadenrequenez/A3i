"use client";

import { useEffect, useMemo, useState } from "react";
import Calendar from "./Calendar";
import ScheduleExport from "./ScheduleExport";
import type { AIFixSuggestion, ScheduleEntry } from "../lib/types";
import {
  fetchFacilities,
  fetchMds,
  fetchSchedules,
  generateSchedule,
  suggestScheduleFixes,
  updateSchedule,
  saveManualCallDay, hasMonthBackup, changeManualMonth, timeOffRequest, type TimeOff
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
  const [timeOff,setTimeOff] = useState<TimeOff[]|null>(null);
  const [firstGuest, setFirstGuest] = useState<string|null>(null);
  const [secondGuest, setSecondGuest] = useState<string|null>(null);
  const [editOffIds, setEditOffIds] = useState<number[]>([]);
  const [offChoice, setOffChoice] = useState('');
  const offForDate = (date:string) => [...new Set((timeOff||[]).filter(r=>r.start_date<=date&&r.end_date>=date).map(r=>mdMap[r.md_id]||'Doctor'))];
  const todayIso = formatIsoDate(new Date());
  const [view, setView] = useState<"month" | "day">("month");
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [month, setMonth] = useState(Number(todayIso.slice(5, 7)));
  const [year, setYear] = useState(Number(todayIso.slice(0, 4)));
  const [monthAction, setMonthAction] = useState<"blank" | "restore" | null>(null);
  const [backupAvailable, setBackupAvailable] = useState(false);
  const [monthChanging, setMonthChanging] = useState(false);
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

  useEffect(() => {
    let cancelled = false;
    setBackupAvailable(false);
    if (role === "admin" && rioFacilityId) hasMonthBackup(rioFacilityId, year, month, getToken())
      .then(value => { if (!cancelled) setBackupAvailable(value); })
      .catch(error => { if (!cancelled) setStatus((error as Error).message); });
    return () => { cancelled = true; };
  }, [year, month, rioFacilityId, role]);

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
            callFirstName: firstId ? mdMap[firstId] || String(firstId) : entry.callAssignments?.first_call_guest_name || undefined,
            callSecondName: secondId ? mdMap[secondId] || String(secondId) : entry.callAssignments?.second_call_guest_name || undefined
          };
        });
        setSchedules(hydrated);

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
            callFirstName: firstId ? mdMap[firstId] || String(firstId) : entry.callAssignments?.first_call_guest_name || undefined,
            callSecondName: secondId ? mdMap[secondId] || String(secondId) : entry.callAssignments?.second_call_guest_name || undefined
          };
        }),
    [schedules, mdMap]
  );

  const daySchedules = useMemo(
    () => hydratedSchedules.filter((entry) => entry.date === selectedDate),
    [hydratedSchedules, selectedDate]
  );

  useEffect(() => {
    const calls = hydratedSchedules.find(item => item.date === selectedDate)?.callAssignments;
    setEditCallFirst(calls?.first_call_md_id ?? null);
    setEditCallSecond(calls?.second_call_md_id ?? null);
    setFirstGuest(calls?.first_call_guest_name ?? null);
    setSecondGuest(calls?.second_call_guest_name ?? null);
  }, [selectedDate, hydratedSchedules]);
  useEffect(() => {
    if (!rioFacilityId) return;
    let cancelled = false;
    timeOffRequest(rioFacilityId, getToken()).then(rows => { if (!cancelled) setTimeOff(rows as TimeOff[]); })
      .catch(error => { if (!cancelled) setStatus((error as Error).message); });
    return () => { cancelled = true; };
  }, [rioFacilityId]);
  useEffect(() => {
    setEditOffIds([...new Set((timeOff || []).filter(r => r.start_date <= selectedDate && r.end_date >= selectedDate).map(r => r.md_id))]);
    setOffChoice('');
  }, [selectedDate, timeOff]);

  const shiftMonth = (delta: number) => {
    const current = parseIsoDate(selectedDate);
    current.setDate(1);
    current.setMonth(current.getMonth() + delta);
    const nextDate = formatIsoDate(current);
    chooseDate(nextDate);
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
      return priorEntry?.callAssignments?.first_call_guest_name || "TBD";
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
  const daysInMonth = new Date(year, month, 0).getDate();
  const completeDays = new Set(schedules.filter(entry => {
    const calls = entry.callAssignments;
    return entry.date.startsWith(`${year}-${String(month).padStart(2,"0")}-`) &&
      (calls?.first_call_md_id || calls?.first_call_guest_name) && (calls?.second_call_md_id || calls?.second_call_guest_name);
  }).map(entry => entry.date)).size;
  const savedFirst = daySchedules[0]?.callAssignments?.first_call_md_id ?? null;
  const savedSecond = daySchedules[0]?.callAssignments?.second_call_md_id ?? null;
  const savedFirstGuest = daySchedules[0]?.callAssignments?.first_call_guest_name ?? null;
  const savedSecondGuest = daySchedules[0]?.callAssignments?.second_call_guest_name ?? null;
  const savedOffIds = [...new Set((timeOff || []).filter(r => r.start_date <= selectedDate && r.end_date >= selectedDate).map(r => r.md_id))];
  const dirty = editCallFirst !== savedFirst || editCallSecond !== savedSecond ||
    (firstGuest?.trim() || null) !== savedFirstGuest || (secondGuest?.trim() || null) !== savedSecondGuest ||
    [...editOffIds].sort((a,b)=>a-b).join(',') !== savedOffIds.sort((a,b)=>a-b).join(',');
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function chooseDate(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || saving) return;
    if (dirty && !window.confirm("Leave this day without saving your changes?")) return;
    setSelectedDate(date); setMonth(Number(date.slice(5,7))); setYear(Number(date.slice(0,4)));
    setStatus(null); setMonthAction(null);
  }
  async function changeMonth(action: "blank" | "restore") {
    if (!rioFacilityId || dirty || monthChanging) return;
    setMonthChanging(true); setSaving(true); setStatus(null);
    try {
      const result = await changeManualMonth(action, rioFacilityId, year, month, getToken());
      await loadSchedules(); setBackupAvailable(result.backup_available);
      setSelectedDate(`${year}-${String(month).padStart(2,"0")}-01`); setView("month");
      setStatus(action === "blank" ? "Your blank month is ready. Save each day as you go; unfinished days will stay blank." : "Previous version restored. Your other version is still available to restore.");
    } catch(error) { setStatus((error as Error).message); }
    finally { setSaving(false); setMonthChanging(false); setMonthAction(null); }
  }
  function goToUnfinishedDay() {
    for (let day=1; day<=daysInMonth; day++) {
      const value = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
      const calls = schedules.find(entry=>entry.date===value)?.callAssignments;
      if (!(calls?.first_call_md_id || calls?.first_call_guest_name) || !(calls?.second_call_md_id || calls?.second_call_guest_name)) {
        chooseDate(value); setView("day"); return;
      }
    }
  }
  async function saveCall(next = false){
    if ((firstGuest !== null && !firstGuest.trim()) || (secondGuest !== null && !secondGuest.trim())) { setStatus("Type the guest’s name, or choose Unassigned to leave that call blank."); return; }
    const firstName = editCallFirst ? mdMap[editCallFirst] : firstGuest?.trim();
    const secondName = editCallSecond ? mdMap[editCallSecond] : secondGuest?.trim();
    if(firstName && secondName && firstName.toLocaleLowerCase() === secondName.toLocaleLowerCase()){setStatus("Choose different doctors for first and second call, or leave either blank.");return;}
    if(!rioFacilityId){setStatus("The facility could not be loaded. Refresh and try again.");return;}
    setSaving(true);setStatus(null);
    try {
      const saved = await saveManualCallDay({date:selectedDate,facility_id:rioFacilityId,first_call_md_id:editCallFirst,second_call_md_id:editCallSecond,expected_first_call_md_id:savedFirst,expected_second_call_md_id:savedSecond,first_call_guest_name:firstGuest?.trim()||null,second_call_guest_name:secondGuest?.trim()||null,expected_first_call_guest_name:savedFirstGuest,expected_second_call_guest_name:savedSecondGuest,off_md_ids:editOffIds,expected_off_md_ids:savedOffIds},getToken());
      const entry: ScheduleEntry = {id:saved.id,date:saved.date,facility:RIO_FACILITY,mdIds:saved.md_ids,crnaIds:saved.crna_ids,callAssignments:saved.call_assignments};
      setSchedules(previous => [...previous.filter(item => item.date !== selectedDate),entry]);
      setTimeOff(saved.time_off_entries);
      setStatus(`${selectedLabel} saved. You can change these assignments anytime.`);
      if(next){const tomorrow=parseIsoDate(selectedDate);tomorrow.setDate(tomorrow.getDate()+1);const date=formatIsoDate(tomorrow);setSelectedDate(date);setMonth(Number(date.slice(5,7)));setYear(Number(date.slice(0,4)));}
    }catch(error){setStatus((error as Error).message);}finally{setSaving(false);}
  }
  return <div className="schedule-workspace">
    <header className="schedule-heading"><div><p className="eyebrow">{RIO_FACILITY}</p><h1>{monthLabel}</h1><label className="text-sm text-slate-600">Schedule month<input aria-label="Schedule month" className="ml-3 mt-2" type="month" min="2000-01" max="2100-12" disabled={saving||loading} value={`${year}-${String(month).padStart(2,"0")}`} onChange={e=>{if(e.target.value)chooseDate(`${e.target.value}-01`);}}/></label></div>
     <div className="schedule-navigation"><div className="view-toggle"><button aria-pressed={view==="month"} onClick={()=>setView("month")}>Month</button><button aria-pressed={view==="day"} onClick={()=>setView("day")}>Day</button></div>
      <button aria-label="Previous month" onClick={()=>shiftMonth(-1)}>‹</button><button onClick={()=>{chooseDate(todayIso);setView("month");}}>Today</button><button aria-label="Next month" onClick={()=>shiftMonth(1)}>›</button>
     </div>
    </header>
    <div className="schedule-body">
     <p className="mb-4 text-sm text-slate-600">Build your call schedule: choose a day, enter either or both calls, and save your progress. Saved days can be edited anytime. You do not need to generate a month first.</p>
     <p className="mb-4 text-sm font-semibold" aria-live="polite">{loading?"Checking saved days…":`${completeDays} of ${daysInMonth} days fully assigned and saved · ${completeDays===daysInMonth?"All days filled — ready for your review":`${daysInMonth-completeDays} days left to fill`}`}{dirty && " · Current edits are not saved"}</p>
     {role==="admin" && <div className="flex flex-wrap gap-2 mb-4">
       <button className="secondary-button" disabled={loading||saving||generating||isGeneratingYear||dirty||backupAvailable} onClick={()=>setMonthAction("blank")}>{monthChanging?"Updating month…":"Start blank month"}</button>
       <button className="primary-button" disabled={loading||saving||completeDays===daysInMonth} onClick={goToUnfinishedDay}>Go to next unfinished day</button>
       {backupAvailable && <button className="secondary-button" disabled={loading||saving||generating||isGeneratingYear||dirty} onClick={()=>setMonthAction("restore")}>Restore previous version</button>}
     </div>}
     <div className="flex flex-wrap gap-2 mb-4">{[['call-totals','Call totals']].map(([id,label])=><button key={id} className="secondary-button" onClick={()=>{const panel=document.getElementById(id) as HTMLDetailsElement|null;if(panel){panel.open=true;panel.scrollIntoView({block:'start'});panel.querySelector('summary')?.focus();}}}>{label}</button>)}</div>
     <ScheduleExport year={year} month={month} facility={RIO_FACILITY} schedules={hydratedSchedules} offForDate={offForDate} disabled={timeOff===null||loading||saving||generating||isGeneratingYear||dirty}/>
     {monthAction && <section className="status-message" aria-label="Confirm month change">
       <p>{monthAction==="blank"?`Start ${monthLabel} blank? Your current call assignments will be kept as a previous version you can restore.`:`Restore the previous version of ${monthLabel}? Your current work will be kept so you can switch back.`}</p>
       <div className="flex gap-2 mt-3"><button className="primary-button" disabled={saving||dirty} onClick={()=>changeMonth(monthAction)}>{monthAction==="blank"?"Keep a copy and start blank":"Restore and keep current version"}</button><button className="secondary-button" disabled={saving} onClick={()=>setMonthAction(null)}>Cancel</button></div>
     </section>}
     {status && <p role="status" className="status-message">{status}</p>}
     {loading && <p role="status" className="status-message">Loading your saved schedule…</p>}
     <div className={`schedule-layout ${view==="day"?"day-view":""}`}>
      <div className="schedule-calendar-area">{view==="day"?<div className="day-overview surface-card"><button className="text-button" onClick={()=>setView("month")}>← Back to month</button><p className="eyebrow mt-6">Daily coverage</p><h2>{selectedLabel}</h2><p className="mt-2 text-sm text-slate-600">{RIO_FACILITY}</p><div className="day-call-summary"><div><span>First call</span><strong>{daySchedules[0]?.callFirstName||"Unassigned"}</strong></div><div><span>Second call</span><strong>{daySchedules[0]?.callSecondName||"Unassigned"}</strong></div><div><span>Post call</span><strong>{postCallName==="TBD"?"Not available":postCallName}</strong></div></div></div>:<Calendar offForDate={offForDate} schedules={hydratedSchedules} view="month" selectedDate={selectedDate} onSelectDate={date=>{chooseDate(date);if(window.matchMedia("(max-width: 700px)").matches)setView("day");}}/>}
      </div>
      <aside className="schedule-detail" aria-label="Selected day">
       <section className="detail-card"><p className="eyebrow">Selected day</p><h2>{selectedLabel}</h2><label className="field-label" htmlFor="schedule-date">Go to date</label><input id="schedule-date" type="date" value={selectedDate} disabled={saving} onChange={e=>chooseDate(e.target.value)}/>
        {!savedFirst&&!savedSecond&&!savedFirstGuest&&!savedSecondGuest&&<p className="empty-note">Fill either call now and come back for the other later.</p>}
        {([['first', 'First-call doctor', editCallFirst, firstGuest, setEditCallFirst, setFirstGuest], ['second', 'Second-call doctor', editCallSecond, secondGuest, setEditCallSecond, setSecondGuest]] as const).map(([key,label,id,guest,setId,setGuest]) => <div key={key}>
          <label className="field-label" htmlFor={`${key}-call`}>{label}</label>
          <select id={`${key}-call`} disabled={role!=="admin"||saving||loading} value={guest!==null?'guest':id??''} onChange={e=>{const value=e.target.value;setId(value==='guest'?null:Number(value)||null);setGuest(value==='guest'?'':null);}}>
            <option value="">Unassigned</option><option value="guest">Type a guest / locum name…</option>
            {Object.entries(mdMap).filter(([doctorId])=>!inactiveMdIds.includes(Number(doctorId))||Number(doctorId)===id).map(([doctorId,name])=><option key={doctorId} value={doctorId} disabled={inactiveMdIds.includes(Number(doctorId))}>{name}{inactiveMdIds.includes(Number(doctorId))?' (removed)':''}</option>)}
          </select>
          {guest!==null&&<><label className="field-label" htmlFor={`${key}-guest`}>Guest / locum name</label><input id={`${key}-guest`} maxLength={120} value={guest} disabled={role!=="admin"||saving} placeholder="Type the doctor’s name" onChange={e=>setGuest(e.target.value)}/><p className="mt-2 text-xs text-slate-600">Saved on this day only. Never added to the roster.</p></>}
        </div>)}
        <fieldset className="mt-5 border-t border-slate-200 pt-4" disabled={role!=="admin"||saving||loading||timeOff===null}>
          <legend className="pt-4 font-semibold">Who’s off this day?</legend>
          <p className="mb-2 text-sm text-slate-600">For {selectedLabel} only. Saved with your calls when you press Save day.</p>
          <ul className="space-y-2">{editOffIds.map(id=><li key={id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-100 p-2 text-sm"><span><strong>OFF</strong> · {mdMap[id]||'Doctor'}</span>{role==='admin'&&<button type="button" className="secondary-button" aria-label={`Remove ${mdMap[id]} from off on ${selectedLabel}`} onClick={()=>setEditOffIds(previous=>previous.filter(item=>item!==id))}>Remove</button>}</li>)}</ul>
          {!editOffIds.length&&<p className="text-sm text-slate-500">No one marked off.</p>}
          {role==='admin'&&<><label className="field-label" htmlFor="off-doctor">Add someone off</label><select id="off-doctor" value={offChoice} onChange={e=>{const id=Number(e.target.value);if(id)setEditOffIds(previous=>[...previous,id]);setOffChoice('');}}><option value="">Choose a doctor to mark OFF…</option>{Object.entries(mdMap).filter(([id])=>!inactiveMdIds.includes(Number(id))&&!editOffIds.includes(Number(id))).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></>}
        </fieldset>
        {[editCallFirst,editCallSecond].some(id=>id!==null&&editOffIds.includes(id))&&<p role="alert" className="mt-3 text-sm text-amber-900">A selected doctor is marked OFF today. You can save your draft, then review this conflict.</p>}
        {role==="admin"?<><p className="mt-3 text-sm text-slate-600">{dirty?"Unsaved changes":daySchedules[0]?((savedFirst||savedFirstGuest)&&(savedSecond||savedSecondGuest)?"Saved · Both calls assigned":"Saved · Still in progress"):"Not saved yet"}</p><button className="primary-button mt-4 w-full" disabled={saving||loading||timeOff===null} onClick={()=>saveCall()}>{saving?"Saving…":"Save day"}</button><button className="secondary-button mt-2 w-full" disabled={saving||loading||timeOff===null} onClick={()=>saveCall(true)}>Save & next day</button></>:<p className="empty-note">View-only access</p>}

       </section>
       {role==="admin"&&<details className="planning-tools"><summary>Automatic tools <span aria-hidden="true">+</span></summary><div className="planning-content"><p>Time-off labels are for your manual planning; automatic tools do not yet apply who is off. Optional: generate a call schedule for <strong>{monthLabel}</strong>. You can build and save your own schedule above without these tools.</p><label className="flex items-center gap-2"><input type="checkbox" checked={overwrite} onChange={e=>setOverwrite(e.target.checked)}/>Replace existing assignments</label><button className="primary-button" disabled={generating||isGeneratingYear||loading||saving||dirty} onClick={generateMonth}>{generating?"Generating…":"Generate month"}</button><button className="secondary-button" disabled={generating||isGeneratingYear||loading||saving||dirty} onClick={generateFullYear}>{isGeneratingYear?"Generating year…":`Generate ${year}`}</button><button className="secondary-button" disabled={!rioFacilityId||generating||isGeneratingYear||saving||dirty} onClick={async()=>{setSuggestionStatus("Checking for suggestions…");try{const result=await suggestScheduleFixes(rioFacilityId!,year,month,getToken());setSuggestions(result.suggestions);setSuggestionStatus(result.suggestions.length?`${result.suggestions.length} suggestions ready to review.`:"No valid suggestions returned.");}catch(e){setSuggestionStatus((e as Error).message);}}}>Review suggestions</button></div></details>}
      </aside>
     </div>
     <details id="call-totals" className="surface-card rounded-xl p-4 mt-4"><summary className="cursor-pointer py-2 font-semibold">Monthly call totals · {monthLabel}</summary><p className="text-sm text-slate-600 my-3">Counts update when you save. Partial days count toward the assigned call.</p><div className="overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Saved call assignments by doctor for {monthLabel}</caption><thead><tr><th scope="col" className="text-left p-3">Doctor</th><th scope="col">1st call</th><th scope="col">2nd call</th><th scope="col">Total</th></tr></thead><tbody>{(() => {
       const rows = hydratedSchedules.filter(r=>r.date.startsWith(`${year}-${String(month).padStart(2,'0')}-`));
       const totals = new Map<string,{name:string;first:number;second:number}>();
       Object.entries(mdMap).filter(([id])=>!inactiveMdIds.includes(Number(id))).forEach(([id,name])=>totals.set(`md:${id}`,{name,first:0,second:0}));
       rows.forEach(row=>{(['first','second'] as const).forEach(call=>{const id=row.callAssignments?.[call==='first'?'first_call_md_id':'second_call_md_id'];const guest=row.callAssignments?.[call==='first'?'first_call_guest_name':'second_call_guest_name'];if(!id&&!guest)return;const key=id?`md:${id}`:`guest:${guest!.toLocaleLowerCase()}`;const item=totals.get(key)||{name:id?mdMap[id]||String(id):`${guest} (guest)`,first:0,second:0};item[call]++;totals.set(key,item);});});
       return [...totals.entries()].map(([key,item])=><tr key={key} className="border-t"><th scope="row" className="text-left p-3 font-normal">{item.name}</th><td className="text-center">{item.first}</td><td className="text-center">{item.second}</td><td className="text-center font-semibold">{item.first+item.second}</td></tr>);
     })()}</tbody></table></div></details>
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
