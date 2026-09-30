"use client";
import {useEffect,useState} from 'react';
import {timeOffRequest,type TimeOff} from '../lib/api';
import {getToken} from '../lib/auth';
export default function TimeOffPanel({facility,doctors,selectedDate,canEdit,onChange}:{facility:number|null;doctors:Record<number,string>;selectedDate:string;canEdit:boolean;onChange:(rows:TimeOff[])=>void}) {
 const [rows,setRows]=useState<TimeOff[]>([]),[doctor,setDoctor]=useState(''),[start,setStart]=useState(selectedDate),[end,setEnd]=useState(selectedDate),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[removed,setRemoved]=useState<TimeOff|null>(null);
 useEffect(()=>{setStart(selectedDate);setEnd(selectedDate);},[selectedDate]);
 async function reload(){if(!facility)return;const next=await timeOffRequest(facility,getToken()) as TimeOff[];setRows(next);onChange(next);}
 useEffect(()=>{let active=true;if(facility)timeOffRequest(facility,getToken()).then(data=>{if(active){setRows(data as TimeOff[]);onChange(data as TimeOff[]);}}).catch(e=>{if(active)setMessage(e.message);});return()=>{active=false;};},[facility,onChange]);
 async function save(event:React.FormEvent){event.preventDefault();if(!facility)return;setBusy(true);try{await timeOffRequest(facility,getToken(),{facility_id:facility,md_id:Number(doctor),start_date:start,end_date:end});await reload();setMessage('Time off saved. Call assignments are unchanged.');}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 const month=selectedDate.slice(0,7),last=`${month}-${new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate()}`;
 const visible=rows.filter(r=>r.start_date<=last&&r.end_date>=`${month}-01`);
 return <details className="surface-card rounded-xl p-4 mt-4"><summary className="cursor-pointer font-semibold py-2">Time off · {visible.length} entries this month</summary>
 <p className="text-sm text-slate-600 my-3">Select a doctor and the first and last day off. OFF appears on every date in the range. Call assignments remain yours to review.</p>
 {canEdit&&<form onSubmit={save} className="flex flex-wrap items-end gap-3"><label className="field-label">Doctor<select required value={doctor} disabled={busy} onChange={e=>setDoctor(e.target.value)}><option value="">Choose a doctor</option>{Object.entries(doctors).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label><label className="field-label">First day off<input required type="date" value={start} disabled={busy} onChange={e=>{setStart(e.target.value);if(e.target.value>end)setEnd(e.target.value);}}/></label><label className="field-label">Last day off<input required type="date" min={start} value={end} disabled={busy} onChange={e=>setEnd(e.target.value)}/></label><button className="primary-button" disabled={busy||!facility}>{busy?'Saving…':'Save time off'}</button></form>}
 {message&&<p role="status" className="my-3 text-sm">{message}</p>}
 <ul className="mt-4 space-y-2">{visible.map(r=><li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2"><span><strong>{doctors[r.md_id]||'Doctor'} OFF</strong> · {r.start_date} to {r.end_date}</span>{canEdit&&<button className="secondary-button" disabled={busy} aria-label={`Remove time off for ${doctors[r.md_id]} from ${r.start_date} to ${r.end_date}`} onClick={async()=>{setBusy(true);try{await timeOffRequest(facility!,getToken(),undefined,r.id);setRemoved(r);await reload();setMessage('Time off removed. You can undo this below.');}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}}>Remove</button>}</li>)}</ul>
 {removed&&canEdit&&<button className="secondary-button mt-3" disabled={busy} onClick={async()=>{setBusy(true);try{await timeOffRequest(facility!,getToken(),removed);await reload();setRemoved(null);setMessage('Time off restored.');}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}}>Undo removal</button>}
 </details>;
}
