"use client";

import { useEffect, useMemo, useState } from "react";
import Calendar, { type CallFocus } from "./Calendar";
import TimeOffPanel from "./TimeOffPanel";
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

export default function ScheduleBoard({accountKey,onNavigationLockChange}:{accountKey?:string;onNavigationLockChange?:(locked:boolean)=>void}) {
  const [focus, setFocus] = useState<CallFocus>("all");
  const [resumeDate, setResumeDate] = useState<string|null>(null);
  const [timeOff,setTimeOff] = useState<TimeOff[]|null>(null);
  const [firstGuest, setFirstGuest] = useState<string|null>(null);
  const [secondGuest, setSecondGuest] = useState<string|null>(null);
  const [offSlots, setOffSlots] = useState<(number|null)[]>([null]);
  const editOffIds = offSlots.filter((id):id is number=>id!==null);
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
  const [daySaving,setSaving] = useState(false);
  const [rangeBusy,setRangeBusy] = useState(false);
  const saving = daySaving || rangeBusy;
  const [generating,setGenerating] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "read-only">("read-only");
  const [inactiveMdIds, setInactiveMdIds] = useState<number[]>([]);
  const [mdMap, setMdMap] = useState<Record<number, string>>({});
  const [editCallFirst, setEditCallFirst] = useState<number | null>(null);
  const [editCallSecond, setEditCallSecond] = useState<number | null>(null);
  const [isGeneratingYear, setIsGeneratingYear] = useState(false);
  const [rioFacilityId, setRioFacilityId] = useState<number | null>(null);
  const resumeKey = accountKey && rioFacilityId ? `a3i:workspace:${accountKey}:${rioFacilityId}:last-saved-day` : null;
  useEffect(() => {
    setResumeDate(null);
    if (!resumeKey) return;
    try {
      const date = localStorage.getItem(resumeKey);
      if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && formatIsoDate(parseIsoDate(date)) === date) setResumeDate(date);
    } catch { /* Scheduling remains available when browser storage is disabled. */ }
  }, [resumeKey]);
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
    const ids = [...new Set((timeOff || []).filter(r => r.start_date <= selectedDate && r.end_date >= selectedDate).map(r => r.md_id))];
    setOffSlots(ids.length ? ids : [null]);
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
  const monthRows = schedules.filter(entry => entry.date.startsWith(`${year}-${String(month).padStart(2,"0")}-`));
  const firstCount = monthRows.filter(entry => entry.callAssignments?.first_call_md_id || entry.callAssignments?.first_call_guest_name).length;
  const secondCount = monthRows.filter(entry => entry.callAssignments?.second_call_md_id || entry.callAssignments?.second_call_guest_name).length;
  const assignedDays = monthRows.filter(entry => entry.callAssignments?.first_call_md_id || entry.callAssignments?.first_call_guest_name || entry.callAssignments?.second_call_md_id || entry.callAssignments?.second_call_guest_name).length;
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || saving) return false;
    if (dirty && !window.confirm("Leave this day without saving your changes?")) return false;
    setSelectedDate(date); setMonth(Number(date.slice(5,7))); setYear(Number(date.slice(0,4)));
    setStatus(null); setMonthAction(null);
    return true;
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
  function shiftDay(delta:number) {
    const date = parseIsoDate(selectedDate); date.setDate(date.getDate()+delta); chooseDate(formatIsoDate(date));
  }
  function goToUnfinishedDay() {
    const current = Number(selectedDate.slice(8));
    for (let offset=1; offset<=daysInMonth; offset++) {
      const day = (current-1+offset)%daysInMonth+1;
      const value = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
      const calls = schedules.find(entry=>entry.date===value)?.callAssignments;
      const first = Boolean(calls?.first_call_md_id || calls?.first_call_guest_name), second = Boolean(calls?.second_call_md_id || calls?.second_call_guest_name);
      if (focus === "first" ? !first : focus === "second" ? !second : !(first && second)) { chooseDate(value); return; }
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
      if (resumeKey) {
        setResumeDate(selectedDate);
        try { localStorage.setItem(resumeKey, selectedDate); } catch { /* Saving to the server already succeeded. */ }
      }
      setStatus(`${selectedLabel} saved. You can change these assignments anytime.`);
      if(next){const tomorrow=parseIsoDate(selectedDate);tomorrow.setDate(tomorrow.getDate()+1);const date=formatIsoDate(tomorrow);setSelectedDate(date);setMonth(Number(date.slice(5,7)));setYear(Number(date.slice(0,4)));}
    }catch(error){setStatus((error as Error).message);}finally{setSaving(false);}
  }
  useEffect(() => { onNavigationLockChange?.(dirty || saving || loading || generating || isGeneratingYear); }, [dirty, saving, loading, generating, isGeneratingYear, onNavigationLockChange]);
  return <div className="schedule-workspace">
    <header className="schedule-heading"><div><p className="eyebrow">{RIO_FACILITY}</p><h1>{monthLabel}</h1><p className="schedule-intro">Build it your way. Save a little, come back anytime.</p></div>
     <div className="schedule-heading-actions"><label className="month-picker"><span className="sr-only">Schedule month</span><input aria-label="Schedule month" type="month" min="2000-01" max="2100-12" disabled={saving||loading} value={`${year}-${String(month).padStart(2,"0")}`} onChange={e=>{if(e.target.value)chooseDate(`${e.target.value}-01`);}}/></label>
      {role==="admin"&&<button className="primary-button" disabled={loading||saving} onClick={()=>{if(resumeDate)chooseDate(resumeDate);else goToUnfinishedDay();}}>Resume scheduling</button>}
     </div>
    </header>
    <div className="schedule-body">
     <div className="schedule-toolbar">
      <div className="call-focus" role="group" aria-label="Calendar call focus">{([['all','Both calls'],['first','1st calls'],['second','2nd calls']] as const).map(([value,label])=><button key={value} aria-pressed={focus===value} onClick={()=>setFocus(value)}>{label}</button>)}</div>
      <div className="schedule-toolbar-actions"><button className="secondary-button" onClick={()=>{const panel=document.getElementById('call-totals') as HTMLDetailsElement|null;if(panel){panel.open=true;panel.scrollIntoView({block:'start'});panel.querySelector('summary')?.focus();}}}>Call totals</button>
       <details className="export-menu"><summary>Export calendar <span aria-hidden="true">↓</span></summary><div><ScheduleExport year={year} month={month} facility={RIO_FACILITY} schedules={hydratedSchedules} offForDate={offForDate} disabled={timeOff===null||loading||saving||generating||isGeneratingYear||dirty}/></div></details>
       {role==="admin"&&<button className="secondary-button" disabled={loading||saving||generating||isGeneratingYear||dirty||backupAvailable} onClick={()=>setMonthAction("blank")}>{monthChanging?"Updating month…":"Start blank month"}</button>}
       {role==="admin"&&backupAvailable&&<button className="secondary-button" disabled={loading||saving||generating||isGeneratingYear||dirty} onClick={()=>setMonthAction("restore")}>Restore previous version</button>}
      </div>
     </div>
     <div className="schedule-progress" aria-live="polite"><span className="progress-meter" aria-hidden="true"><span style={{width:`${completeDays/daysInMonth*100}%`}}/><span style={{width:`${(assignedDays-completeDays)/daysInMonth*100}%`}}/></span><span><strong>{firstCount} / {daysInMonth}</strong> 1st calls</span><span><strong>{secondCount} / {daysInMonth}</strong> 2nd calls</span><span>{daysInMonth-assignedDays} days without calls</span><span className="progress-note">{loading?"Loading saved progress…":dirty?"Current day has unsaved changes":completeDays===daysInMonth?"Both calls filled · Ready for your review":"Partial days stay saved"}</span></div>
     <div className="schedule-navigation"><div className="view-toggle"><button aria-pressed={view==="month"} onClick={()=>setView("month")}>Month</button><button aria-pressed={view==="day"} onClick={()=>setView("day")}>Day</button></div><span className="focus-note">{focus==='all'?'Reviewing both calls':`Working on ${focus==='first'?'1st':'2nd'} calls`}</span><button aria-label="Previous month" disabled={saving||loading} onClick={()=>shiftMonth(-1)}>‹</button><button disabled={saving||loading} onClick={()=>{chooseDate(todayIso);setView("month");}}>Today</button><button aria-label="Next month" disabled={saving||loading} onClick={()=>shiftMonth(1)}>›</button></div>
     {monthAction && <section className="status-message" aria-label="Confirm month change">
       <p>{monthAction==="blank"?`Start ${monthLabel} blank? Your current call assignments will be kept as a previous version you can restore.`:`Restore the previous version of ${monthLabel}? Your current work will be kept so you can switch back.`}</p>
       <div className="flex gap-2 mt-3"><button className="primary-button" disabled={saving||dirty} onClick={()=>changeMonth(monthAction)}>{monthAction==="blank"?"Keep a copy and start blank":"Restore and keep current version"}</button><button className="secondary-button" disabled={saving} onClick={()=>setMonthAction(null)}>Cancel</button></div>
     </section>}
     {status && <p role="status" className="status-message">{status}</p>}
     {loading && <p role="status" className="status-message">Loading your saved schedule…</p>}
     <div className={`schedule-layout ${view==="day"?"day-view":""}`}>
      <div className="schedule-calendar-area">{view==="day"?<div className="day-overview surface-card"><button className="text-button" onClick={()=>setView("month")}>← Back to month</button><p className="eyebrow mt-6">Daily coverage</p><h2>{selectedLabel}</h2><p className="mt-2 text-sm text-slate-600">{RIO_FACILITY}</p><div className="day-call-summary"><div><span>First call</span><strong>{daySchedules[0]?.callFirstName||"Unassigned"}</strong></div><div><span>Second call</span><strong>{daySchedules[0]?.callSecondName||"Unassigned"}</strong></div><div><span>Post call</span><strong>{postCallName==="TBD"?"Not available":postCallName}</strong></div></div></div>:<Calendar offForDate={offForDate} schedules={hydratedSchedules} view="month" focus={focus} selectedDate={selectedDate} onSelectDate={date=>{if(chooseDate(date)&&window.matchMedia("(max-width: 950px)").matches)document.querySelector('.schedule-detail')?.scrollIntoView({block:'start'});}}/>}
      </div>
      <aside className="schedule-detail" aria-label="Selected day">
       <section className="detail-card"><div className="editor-heading"><div><p className="eyebrow">Selected day</p><h2>{selectedLabel}</h2></div><div className="day-arrows"><button aria-label="Previous day" disabled={saving||loading} onClick={()=>shiftDay(-1)}>‹</button><button aria-label="Next day" disabled={saving||loading} onClick={()=>shiftDay(1)}>›</button></div></div><label className="field-label" htmlFor="schedule-date">Go to date</label><input id="schedule-date" type="date" value={selectedDate} disabled={saving} onChange={e=>chooseDate(e.target.value)}/>
        {!savedFirst&&!savedSecond&&!savedFirstGuest&&!savedSecondGuest&&<p className="empty-note">Fill either call now and come back for the other later.</p>}
        {([['first', '1st call', editCallFirst, firstGuest, setEditCallFirst, setFirstGuest], ['second', '2nd call', editCallSecond, secondGuest, setEditCallSecond, setSecondGuest]] as const).map(([key,label,id,guest,setId,setGuest]) => <div key={key}>
          <label className="field-label" htmlFor={`${key}-call`}>{label}</label>
          <select id={`${key}-call`} disabled={role!=="admin"||saving||loading} value={guest!==null?'guest':id??''} onChange={e=>{const value=e.target.value;setId(value==='guest'?null:Number(value)||null);setGuest(value==='guest'?'':null);}}>
            <option value="">Unassigned</option><option value="guest">Type a guest / locum name…</option>
            {Object.entries(mdMap).filter(([doctorId])=>!inactiveMdIds.includes(Number(doctorId))||Number(doctorId)===id).map(([doctorId,name])=><option key={doctorId} value={doctorId} disabled={inactiveMdIds.includes(Number(doctorId))}>{name}{inactiveMdIds.includes(Number(doctorId))?' (removed)':''}</option>)}
          </select>
          {guest!==null&&<><label className="field-label" htmlFor={`${key}-guest`}>Guest / locum name</label><input id={`${key}-guest`} maxLength={120} value={guest} disabled={role!=="admin"||saving} placeholder="Type the doctor’s name" onChange={e=>setGuest(e.target.value)}/><p className="mt-2 text-xs text-slate-600">Saved on this day only. Never added to the roster.</p></>}
        </div>)}
        <fieldset className="day-off-fields" disabled={role!=="admin"||saving||loading||timeOff===null} aria-label="Off for the selected day">
          {offSlots.map((id,index)=><div key={index}>
            <label className="field-label" htmlFor={`off-doctor-${index}`}>{index===0?'Off':`Off · person ${index+1}`}</label>
            <div className="flex items-center gap-2">
              <select className="min-w-0 flex-1" id={`off-doctor-${index}`} value={id??''} onChange={e=>setOffSlots(previous=>previous.map((value,slot)=>slot===index?Number(e.target.value)||null:value))}>
                <option value="">Unassigned</option>
                {Object.entries(mdMap).filter(([doctorId])=>(!inactiveMdIds.includes(Number(doctorId))||Number(doctorId)===id)&&(!editOffIds.includes(Number(doctorId))||Number(doctorId)===id)).map(([doctorId,name])=><option key={doctorId} value={doctorId} disabled={inactiveMdIds.includes(Number(doctorId))}>{name}{inactiveMdIds.includes(Number(doctorId))?' (removed)':''}</option>)}
              </select>
              {role==='admin'&&offSlots.length>1&&<button type="button" className="secondary-button" aria-label={`Remove off selection ${index+1}${id?` for ${mdMap[id]}`:''}`} onClick={()=>setOffSlots(previous=>previous.filter((_,slot)=>slot!==index))}>Remove</button>}
            </div>
          </div>)}
          {role==='admin'&&<button type="button" className="secondary-button mt-2 w-full" onClick={()=>setOffSlots(previous=>[...previous,null])}>+ Add another person off</button>}
          <p className="mt-2 text-xs text-slate-600">For this day only. Choose as many people as needed, then Save day.</p>
        </fieldset>
        {[editCallFirst,editCallSecond].some(id=>id!==null&&editOffIds.includes(id))&&<p role="alert" className="mt-3 text-sm text-amber-900">A selected doctor is marked OFF today. You can save your draft, then review this conflict.</p>}
        {role==="admin"?<><p className={`day-save-state ${dirty?"unsaved":""}`} role="status">{dirty?"Unsaved changes":daySchedules[0]?((savedFirst||savedFirstGuest)&&(savedSecond||savedSecondGuest)?"Saved · Both calls assigned":"Saved · Still in progress"):"Not saved yet"}</p><button className="primary-button mt-4 w-full" disabled={saving||loading||timeOff===null} onClick={()=>saveCall()}>{saving?"Saving…":"Save day"}</button><button className="secondary-button mt-2 w-full" disabled={saving||loading||timeOff===null} onClick={()=>saveCall(true)}>Save & next day</button></>:<p className="empty-note">View-only access</p>}

        {role==="admin"&&<button className="text-button next-unfinished" disabled={loading||saving||(focus==='first'?firstCount===daysInMonth:focus==='second'?secondCount===daysInMonth:completeDays===daysInMonth)} onClick={goToUnfinishedDay}>Next unfinished {focus==='all'?'day':`${focus==='first'?'1st':'2nd'} call`} <span aria-hidden="true">→</span></button>}
        <TimeOffPanel facility={rioFacilityId} doctors={mdMap} inactiveIds={inactiveMdIds} selectedDate={selectedDate} canEdit={role==="admin"} entries={timeOff} disabled={dirty||daySaving||loading} onBusyChange={setRangeBusy} onChange={setTimeOff}/>
       </section>

      </aside>
     </div>
     {role==="admin"&&<details className="planning-tools"><summary>Automatic tools <span aria-hidden="true">+</span></summary><div className="planning-content"><p>Time-off labels are for your manual planning; automatic tools do not yet apply who is off. Optional: generate a call schedule for <strong>{monthLabel}</strong>. You can build and save your own schedule above without these tools.</p><label className="flex items-center gap-2"><input type="checkbox" checked={overwrite} onChange={e=>setOverwrite(e.target.checked)}/>Replace existing assignments</label><button className="primary-button" disabled={generating||isGeneratingYear||loading||saving||dirty} onClick={generateMonth}>{generating?"Generating…":"Generate month"}</button><button className="secondary-button" disabled={generating||isGeneratingYear||loading||saving||dirty} onClick={generateFullYear}>{isGeneratingYear?"Generating year…":`Generate ${year}`}</button><button className="secondary-button" disabled={!rioFacilityId||generating||isGeneratingYear||saving||dirty} onClick={async()=>{setSuggestionStatus("Checking for suggestions…");try{const result=await suggestScheduleFixes(rioFacilityId!,year,month,getToken());setSuggestions(result.suggestions);setSuggestionStatus(result.suggestions.length?`${result.suggestions.length} suggestions ready to review.`:"No valid suggestions returned.");}catch(e){setSuggestionStatus((e as Error).message);}}}>Review suggestions</button></div></details>}
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
                    disabled={applyingSuggestionIndex !== null || dirty || saving || generating || isGeneratingYear}
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
