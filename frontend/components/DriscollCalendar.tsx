"use client";
import { useEffect, useMemo, useState } from "react";
import Calendar, { type CallFocus } from "./Calendar";
import ScheduleExport from "./ScheduleExport";
import { changeManualMonth, fetchSchedules, hasMonthBackup } from "../lib/api";
import { getRole, getToken } from "../lib/auth";
import { driscollCalls, saveDriscollCallDay, type CallChoice } from "../lib/driscollCall";
import { workforceRequest, type WorkforceSettings, type RosterMember } from "../lib/workforce";
import type { Facility, ScheduleEntry } from "../lib/types";
const emptyChoice = (): CallChoice => ({ key: null, guest_name: null });
const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
const dateValue = (iso: string) => { const [y,m,d] = iso.split("-").map(Number); return new Date(y,m-1,d); };
export default function DriscollCalendar({ facility, accountKey, onNavigationLockChange, onOpenWorkforce }: {
  facility: Facility | null; accountKey?: string; onNavigationLockChange: (locked: boolean) => void; onOpenWorkforce: () => void;
}) {
  const [selectedDate, setSelectedDate] = useState(() => isoDate(new Date()));
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]), [roster, setRoster] = useState<RosterMember[]>([]);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(false), [status, setStatus] = useState<string | null>(null);
  const [ready, setReady] = useState(false), [backup, setBackup] = useState(false);
  const [monthAction, setMonthAction] = useState<"blank" | "restore" | null>(null);
  const [first, setFirst] = useState<CallChoice>(emptyChoice), [second, setSecond] = useState<CallChoice>(emptyChoice);
  const [offSlots, setOffSlots] = useState<string[]>([""]), [focus, setFocus] = useState<CallFocus>("all");
  const [resume, setResume] = useState<string | null>(null);
  const [year, month] = selectedDate.split("-").map(Number);
  const monthDate = selectedDate.slice(0,7), count = new Date(year,month,0).getDate();
  const monthLabel = new Date(year,month-1,1).toLocaleDateString(undefined,{month:"long",year:"numeric"});
  const dayLabel = dateValue(selectedDate).toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"});
  const name = facility?.site_name || "Driscoll Pediatrics";
  const resumeKey = accountKey && facility ? `a3i:workspace:${accountKey}:${facility.id}:last-saved-day` : null;
  const saved = schedules.find(row => row.date === selectedDate), calls = driscollCalls(saved);
  const offKeys = offSlots.filter(Boolean);
  const dirty = first.key !== (calls.first_call_key || null) || second.key !== (calls.second_call_key || null)
    || (first.guest_name?.trim() || null) !== (calls.first_call_guest_name || null)
    || (second.guest_name?.trim() || null) !== (calls.second_call_guest_name || null)
    || [...offKeys].sort().join(",") !== [...(calls.off_keys || [])].sort().join(",");
  const hydrated = useMemo(() => schedules.map(row => {
    const value = driscollCalls(row);
    const display = (key?: string | null, stored?: string | null) => roster.find(p=>p.key===key)?.name || stored || undefined;
    return {...row, callFirstName: display(value.first_call_key, value.first_call_name), callSecondName: display(value.second_call_key, value.second_call_name)};
  }),[schedules,roster]);
  const offForDate = (date: string) => { const value = driscollCalls(schedules.find(row=>row.date===date)); return (value.off_keys || []).map((key,index)=>roster.find(p=>p.key===key)?.name || value.off_names?.[index] || "Removed doctor"); };
  const monthRows = hydrated.filter(row=>row.date.startsWith(`${monthDate}-`));
  const firstCount = monthRows.filter(row=>row.callFirstName).length, secondCount = monthRows.filter(row=>row.callSecondName).length;
  const complete = monthRows.filter(row=>row.callFirstName && row.callSecondName).length;
  const assigned = monthRows.filter(row=>row.callFirstName || row.callSecondName).length;
  const blocked = loading || saving || !ready;
  useEffect(() => {
    let cancelled = false;
    setCanEdit(getRole()==="admin");setLoading(true);setReady(false);
    if (!facility) { setLoading(false); setStatus("Driscoll could not be loaded. Refresh the page and try again."); return; }
    Promise.all([fetchSchedules(getToken()), workforceRequest<WorkforceSettings>("settings",getToken())])
      .then(([rows,settings])=>{ if (!cancelled) { setSchedules(rows.filter(row=>row.facility===facility.site_name)); setRoster(settings.rosters[String(facility.id)] || []); setReady(true); setStatus(null); } })
      .catch(error=>{if(!cancelled)setStatus((error as Error).message);}).finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
  },[facility]);
  useEffect(()=>{
    let cancelled=false;
    const refresh=()=>{if(facility)workforceRequest<WorkforceSettings>("settings",getToken()).then(settings=>{if(!cancelled)setRoster(settings.rosters[String(facility.id)] || []);}).catch(error=>{if(!cancelled)setStatus((error as Error).message);});};
    window.addEventListener("a3i-team-saved",refresh);
    return()=>{cancelled=true;window.removeEventListener("a3i-team-saved",refresh);};
  },[facility]);
  useEffect(()=>{
    const value=driscollCalls(saved);
    setFirst({key:value.first_call_key || null,guest_name:value.first_call_guest_name || null});
    setSecond({key:value.second_call_key || null,guest_name:value.second_call_guest_name || null});
    setOffSlots(value.off_keys?.length ? value.off_keys : [""]);
  },[selectedDate,saved]);
  useEffect(()=>{
    let cancelled=false;setBackup(false);
    if(canEdit && facility)hasMonthBackup(facility.id,year,month,getToken()).then(value=>{if(!cancelled)setBackup(value);}).catch(error=>{if(!cancelled)setStatus((error as Error).message);});
    return ()=>{cancelled=true;};
  },[facility,year,month,canEdit]);
  useEffect(()=>{
    setResume(null);
    try { const value=resumeKey && localStorage.getItem(resumeKey); if(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && isoDate(dateValue(value))===value)setResume(value); } catch { /* Server saves work without browser storage. */ }
  },[resumeKey]);
  useEffect(()=>{onNavigationLockChange(dirty || loading || saving);},[dirty,loading,saving,onNavigationLockChange]);
  useEffect(()=>{
    if(!dirty)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",warn); return()=>window.removeEventListener("beforeunload",warn);
  },[dirty]);
  function chooseDate(date:string) {
    if(date===selectedDate)return;
    if(blocked || !/^\d{4}-\d{2}-\d{2}$/.test(date) || isoDate(dateValue(date))!==date || date<"2000-01-01" || date>"2100-12-31")return;
    if(dirty && !window.confirm("Leave this day without saving your changes?"))return;
    setSelectedDate(date);setStatus(null);setMonthAction(null);
  }
  function shiftMonth(delta:number) { chooseDate(isoDate(new Date(year,month-1+delta,1))); }
  function nextUnfinished() {
    const start=Number(selectedDate.slice(8));
    for(let offset=1;offset<=count;offset++) {
      const day=(start-1+offset)%count+1, date=`${monthDate}-${String(day).padStart(2,"0")}`;
      const row=hydrated.find(row=>row.date===date);
      if(focus==="first"?!row?.callFirstName:focus==="second"?!row?.callSecondName:!(row?.callFirstName&&row?.callSecondName)){chooseDate(date);return;}
    }
  }
  async function saveDay(next=false) {
    if(!facility || blocked || !canEdit)return;
    if([first,second].some(choice=>choice.guest_name!==null && !choice.guest_name.trim())) { setStatus("Type the guest’s name, or choose Unassigned to leave that call blank."); return; }
    setSaving(true);setStatus(null);
    try {
      const entry=await saveDriscollCallDay({date:selectedDate,facility_id:facility.id,expected_revision:calls.revision || 0,first:{...first,guest_name:first.guest_name?.trim() || null},second:{...second,guest_name:second.guest_name?.trim() || null},off_keys:offKeys},getToken());
      setSchedules(previous=>[...previous.filter(row=>row.date!==selectedDate),entry]);
      setResume(selectedDate);if(resumeKey)try{localStorage.setItem(resumeKey,selectedDate);}catch{/* Saved on server. */}
      setStatus(`${dayLabel} saved. You can change these assignments anytime.`);
      if(next && selectedDate<"2100-12-31") {const date=dateValue(selectedDate);date.setDate(date.getDate()+1);setSelectedDate(isoDate(date));}
    }catch(error){setStatus((error as Error).message);}finally{setSaving(false);}
  }
  async function reloadDay() {
    if(!facility || loading || saving)return;
    if(dirty && !window.confirm("Discard your unsaved changes and reload the saved Driscoll schedule?"))return;
    setLoading(true);
    try { const [rows,settings]=await Promise.all([fetchSchedules(getToken()),workforceRequest<WorkforceSettings>("settings",getToken())]);setSchedules(rows.filter(row=>row.facility===facility.site_name));setRoster(settings.rosters[String(facility.id)] || []);setReady(true);setStatus("Saved Driscoll schedule reloaded."); }
    catch(error){setStatus((error as Error).message);}finally{setLoading(false);}
  }
  async function changeMonth(action:"blank"|"restore") {
    if(!facility || blocked || dirty)return;
    setSaving(true);
    try {const result=await changeManualMonth(action,facility.id,year,month,getToken());setBackup(result.backup_available);const rows=await fetchSchedules(getToken());setSchedules(rows.filter(row=>row.facility===facility.site_name));setStatus(action==="blank"?"Your blank Driscoll month is ready. Previous assignments are saved for restoring.":"Previous Driscoll version restored. Your other version is still available.");}
    catch(error){setStatus((error as Error).message);}finally{setSaving(false);setMonthAction(null);}
  }
  const options=(key:string|null,oldName?:string|null,exclude:string[]=[])=>{
    const list=roster.filter(p=>(p.active || p.key===key)&&(!exclude.includes(p.key)||p.key===key));
    if(key && !list.some(p=>p.key===key))list.push({key,name:oldName || "Removed doctor",active:false});
    return list.map(p=><option key={p.key} value={p.key} disabled={!p.active}>{p.name}{!p.active?" (removed)":""}</option>);
  };
  const totals=new Map<string,{name:string;first:number;second:number}>();
  roster.filter(p=>p.active).forEach(p=>totals.set(p.key,{name:p.name,first:0,second:0}));
  monthRows.forEach(row=>{const value=driscollCalls(row);(["first","second"] as const).forEach(position=>{const display=position==="first"?row.callFirstName:row.callSecondName;if(!display)return;const key=value[`${position}_call_key`] || `guest:${display.toLowerCase()}`;const item=totals.get(key) || {name:display,first:0,second:0};item[position]++;totals.set(key,item);});});
  return <div className="schedule-workspace driscoll-workspace">
    <header className="schedule-heading"><div><p className="eyebrow">{name} · Pediatrics</p><h1>{monthLabel}</h1><p className="schedule-intro">Build it your way. Save a little, come back anytime.</p></div><div className="schedule-heading-actions"><label className="month-picker"><span className="sr-only">Driscoll calendar month</span><input aria-label="Driscoll calendar month" type="month" min="2000-01" max="2100-12" disabled={blocked} value={monthDate} onChange={e=>chooseDate(`${e.target.value}-01`)}/></label>{canEdit&&<button className="primary-button" disabled={blocked} onClick={()=>resume?chooseDate(resume):nextUnfinished()}>Resume scheduling</button>}</div></header>
    <div className="schedule-body">
      <div className="schedule-toolbar"><div className="call-focus" role="group" aria-label="Driscoll call focus">{([["all","Both calls"],["first","1st calls"],["second","2nd calls"]] as const).map(([value,label])=><button key={value} aria-pressed={focus===value} onClick={()=>setFocus(value)}>{label}</button>)}</div><div className="schedule-toolbar-actions"><details className="export-menu"><summary>Export Driscoll calendar <span aria-hidden="true">↓</span></summary><div><ScheduleExport year={year} month={month} facility={name} schedules={hydrated} offForDate={offForDate} disabled={blocked||dirty}/></div></details>{canEdit&&<button className="secondary-button" disabled={blocked||dirty||backup} onClick={()=>setMonthAction("blank")}>Start blank month</button>}{canEdit&&backup&&<button className="secondary-button" disabled={blocked||dirty} onClick={()=>setMonthAction("restore")}>Restore previous version</button>}</div></div>
      <div className="schedule-progress" aria-live="polite"><span className="progress-meter" aria-hidden="true"><span style={{width:`${complete/count*100}%`}}/><span style={{width:`${(assigned-complete)/count*100}%`}}/></span><span><strong>{firstCount} / {count}</strong> 1st calls</span><span><strong>{secondCount} / {count}</strong> 2nd calls</span><span>{count-assigned} days without calls</span><span className="progress-note">{loading?"Loading saved progress…":dirty?"Current day has unsaved changes":"Partial days stay saved"}</span></div>
      <div className="schedule-navigation"><span className="focus-note">Driscoll pediatric call coverage</span><button aria-label="Previous Driscoll month" disabled={blocked||monthDate==="2000-01"} onClick={()=>shiftMonth(-1)}>‹</button><button disabled={blocked} onClick={()=>chooseDate(isoDate(new Date()))}>Today</button><button aria-label="Next Driscoll month" disabled={blocked||monthDate==="2100-12"} onClick={()=>shiftMonth(1)}>›</button><button className="text-button" disabled={loading||saving} onClick={reloadDay}>Reload saved schedule</button></div>
      {monthAction&&<section className="status-message" aria-label="Confirm Driscoll month change"><p>{monthAction==="blank"?`Start ${monthLabel} blank? Your current Driscoll calls will be kept as a previous version. Off entries stay saved.`:`Restore the previous Driscoll version of ${monthLabel}? Your current version will be kept so you can switch back.`}</p><div className="flex gap-2 mt-3"><button className="primary-button" disabled={blocked||dirty} onClick={()=>changeMonth(monthAction)}>{monthAction==="blank"?"Keep a copy and start blank":"Restore and keep current version"}</button><button className="secondary-button" disabled={saving} onClick={()=>setMonthAction(null)}>Cancel</button></div></section>}
      {status&&<p role="status" className="status-message">{status}</p>}{loading&&<p role="status" className="status-message">Loading your saved Driscoll schedule…</p>}
      <div className="schedule-layout"><div className="schedule-calendar-area"><Calendar schedules={hydrated} view="month" selectedDate={selectedDate} focus={focus} offForDate={offForDate} onSelectDate={date=>{chooseDate(date);if(window.matchMedia("(max-width: 950px)").matches)document.querySelector('.schedule-detail')?.scrollIntoView({block:'start'});}}/></div>
        <aside className="schedule-detail" aria-label="Driscoll selected day"><section className="detail-card"><div className="editor-heading"><div><p className="eyebrow">Selected day</p><h2>{dayLabel}</h2></div><div className="day-arrows"><button aria-label="Previous Driscoll day" disabled={blocked||selectedDate==="2000-01-01"} onClick={()=>{const date=dateValue(selectedDate);date.setDate(date.getDate()-1);chooseDate(isoDate(date));}}>‹</button><button aria-label="Next Driscoll day" disabled={blocked||selectedDate==="2100-12-31"} onClick={()=>{const date=dateValue(selectedDate);date.setDate(date.getDate()+1);chooseDate(isoDate(date));}}>›</button></div></div><label className="field-label" htmlFor="driscoll-date">Go to date</label><input id="driscoll-date" type="date" min="2000-01-01" max="2100-12-31" value={selectedDate} disabled={blocked} onChange={e=>chooseDate(e.target.value)}/><p className="empty-note">Fill either call now and come back for the other later.</p>
          {([["first","1st call",first,setFirst],["second","2nd call",second,setSecond]] as const).map(([position,label,choice,setChoice])=><div key={position}><label className="field-label" htmlFor={`driscoll-${position}-call`}>{label}</label><select id={`driscoll-${position}-call`} disabled={!canEdit||blocked} value={choice.guest_name!==null?"guest":choice.key || ""} onChange={e=>setChoice(e.target.value==="guest"?{key:null,guest_name:""}:{key:e.target.value||null,guest_name:null})}><option value="">Unassigned</option><option value="guest">Type a guest / locum name…</option>{options(choice.key,calls[`${position}_call_name`])}</select>{choice.guest_name!==null&&<><label className="field-label" htmlFor={`driscoll-${position}-guest`}>Guest / locum name</label><input id={`driscoll-${position}-guest`} maxLength={120} value={choice.guest_name} disabled={!canEdit||blocked} placeholder="Type the doctor’s name" onChange={e=>setChoice({key:null,guest_name:e.target.value})}/><p className="mt-2 text-xs text-slate-600">Saved on this day only. Never added to the roster.</p></>}</div>)}
          <fieldset className="day-off-fields" disabled={!canEdit||blocked} aria-label="Driscoll Off for the selected day">{offSlots.map((key,index)=><div key={index}><label className="field-label" htmlFor={`driscoll-off-${index}`}>{index===0?"Off":`Off · person ${index+1}`}</label><div className="flex items-center gap-2"><select id={`driscoll-off-${index}`} className="min-w-0 flex-1" value={key} onChange={e=>setOffSlots(previous=>previous.map((value,i)=>i===index?e.target.value:value))}><option value="">Unassigned</option>{options(key,calls.off_names?.[(calls.off_keys||[]).indexOf(key)],offKeys)}</select>{offSlots.length>1&&<button className="secondary-button" aria-label={`Remove Driscoll off selection ${index+1}`} onClick={()=>setOffSlots(previous=>previous.filter((_,i)=>i!==index))}>Remove</button>}</div></div>)}{canEdit&&<button className="secondary-button mt-2 w-full" onClick={()=>setOffSlots(previous=>[...previous,""])}>+ Add another person off</button>}<p className="mt-2 text-xs text-slate-600">Private to you and office staff. Excluded from hospital and provider copies.</p></fieldset>
          {[first.key,second.key].some(key=>key&&offKeys.includes(key))&&<p role="alert" className="mt-3 text-sm text-amber-900">A selected doctor is marked OFF today. You can save your draft, then review this conflict.</p>}
          <p className={`day-save-state ${dirty?"unsaved":""}`} role="status">{dirty?"Unsaved changes":saved?(calls.first_call_name&&calls.second_call_name?"Saved · Both calls assigned":"Saved · Still in progress"):"Not saved yet"}</p>{canEdit?<><button className="primary-button mt-4 w-full" disabled={blocked} onClick={()=>saveDay()}>{saving?"Saving…":"Save day"}</button><button className="secondary-button mt-2 w-full" disabled={blocked||selectedDate==="2100-12-31"} onClick={()=>saveDay(true)}>Save & next day</button><button className="text-button next-unfinished" disabled={blocked} onClick={nextUnfinished}>Next unfinished {focus==="all"?"day":focus==="first"?"1st call":"2nd call"} →</button></>:<p className="empty-note">View-only access</p>}
          {!roster.some(p=>p.active)&&ready&&<p className="empty-note">Add Driscoll doctors in Team, or type a guest / locum name for this day.</p>}<button className="text-button mt-4" disabled={blocked||dirty} onClick={onOpenWorkforce}>Open Driscoll workforce</button>
        </section></aside>
      </div>
      <details className="surface-card rounded-xl p-4 mt-4"><summary className="cursor-pointer py-2 font-semibold">Monthly call totals · {monthLabel}</summary><p className="text-sm text-slate-600 my-3">Counts update when you save. Partial days count toward the assigned call.</p><div className="overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Saved Driscoll call assignments by doctor</caption><thead><tr><th scope="col" className="text-left p-3">Doctor</th><th scope="col">1st call</th><th scope="col">2nd call</th><th scope="col">Total</th></tr></thead><tbody>{[...totals.entries()].map(([key,item])=><tr key={key} className="border-t"><th scope="row" className="text-left p-3 font-normal">{item.name}</th><td className="text-center">{item.first}</td><td className="text-center">{item.second}</td><td className="text-center font-semibold">{item.first+item.second}</td></tr>)}</tbody></table></div></details>
    </div>
  </div>;
}
