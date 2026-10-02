"use client";
import {useEffect,useState} from 'react';
import {timeOffRequest,type TimeOff} from '../lib/api';
import {getToken} from '../lib/auth';
export default function TimeOffPanel({facility,doctors,inactiveIds=[],selectedDate,canEdit,entries,disabled=false,onBusyChange,onChange}:{facility:number|null;doctors:Record<number,string>;inactiveIds?:number[];selectedDate:string;canEdit:boolean;entries:TimeOff[]|null;disabled?:boolean;onBusyChange:(busy:boolean)=>void;onChange:(rows:TimeOff[])=>void}) {
 const rows=entries||[];
 const [doctor,setDoctor]=useState(''),[start,setStart]=useState(selectedDate),[end,setEnd]=useState(selectedDate),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[removed,setRemoved]=useState<TimeOff|null>(null);
 useEffect(()=>{setStart(selectedDate);setEnd(selectedDate);},[selectedDate]);
 async function reload(){if(!facility)return;const next=await timeOffRequest(facility,getToken()) as TimeOff[];onChange(next);}
 async function save(event:React.FormEvent){event.preventDefault();if(!facility||disabled||entries===null)return;changeBusy(true);try{await timeOffRequest(facility,getToken(),{facility_id:facility,md_id:Number(doctor),start_date:start,end_date:end});await reload();setMessage('Time off saved. Call assignments are unchanged.');}catch(e){setMessage((e as Error).message);}finally{changeBusy(false);}}
 function changeBusy(value:boolean){setBusy(value);onBusyChange(value);}
 const month=selectedDate.slice(0,7),last=`${month}-${new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate()}`;
 const visible=rows.filter(r=>r.start_date<=last&&r.end_date>=`${month}-01`);
 return <details id="time-off-panel" className="mt-4 border-t border-slate-200 pt-3"><summary className="cursor-pointer font-semibold py-2">Optional: mark off across dates</summary>
 <p className="text-sm text-slate-600 my-3">For several days at once, choose a doctor and a date range. This saves separately from Save day.</p>
 {canEdit&&disabled&&<p role="status" className="mb-3 text-sm text-amber-900">Save your day edits before changing a date range.</p>}
 {canEdit&&<form onSubmit={save}><fieldset disabled={busy||disabled||entries===null} className="space-y-3"><label className="field-label">Doctor<select required value={doctor} disabled={busy} onChange={e=>setDoctor(e.target.value)}><option value="">Choose a doctor</option>{Object.entries(doctors).filter(([id])=>!inactiveIds.includes(Number(id))).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label><label className="field-label">First day off<input required type="date" value={start} disabled={busy} onInput={e=>{setStart(e.currentTarget.value);if(e.currentTarget.value>end)setEnd(e.currentTarget.value);}} onChange={e=>{setStart(e.target.value);if(e.target.value>end)setEnd(e.target.value);}}/></label><label className="field-label">Last day off<input required type="date" min={start} value={end} disabled={busy} onInput={e=>setEnd(e.currentTarget.value)} onChange={e=>setEnd(e.target.value)}/></label><button className="primary-button" disabled={busy||disabled||!facility||entries===null}>{busy?'Saving…':'Save date range'}</button></fieldset></form>}
 {message&&<p role="status" className="my-3 text-sm">{message}</p>}
 <ul className="mt-4 space-y-2">{visible.map(r=><li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2"><span><strong>{doctors[r.md_id]||'Doctor'} OFF</strong> · {r.start_date} to {r.end_date}</span>{canEdit&&<button className="secondary-button" disabled={busy||disabled} aria-label={`Remove time off for ${doctors[r.md_id]} from ${r.start_date} to ${r.end_date}`} onClick={async()=>{changeBusy(true);try{await timeOffRequest(facility!,getToken(),undefined,r.id);setRemoved(r);await reload();setMessage('Time off removed. You can undo this below.');}catch(e){setMessage((e as Error).message);}finally{changeBusy(false);}}}>Remove</button>}</li>)}</ul>
 {removed&&canEdit&&<button className="secondary-button mt-3" disabled={busy||disabled} onClick={async()=>{changeBusy(true);try{await timeOffRequest(facility!,getToken(),removed);await reload();setRemoved(null);setMessage('Time off restored.');}catch(e){setMessage((e as Error).message);}finally{changeBusy(false);}}}>Undo removal</button>}
 </details>;
}
