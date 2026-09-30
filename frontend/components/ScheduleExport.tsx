"use client";
import { useState } from "react";
import type { ReactNode, ReactPortal } from "react";
const { createPortal } = require("react-dom") as { createPortal: (children: ReactNode, container: Element) => ReactPortal };
import type { ScheduleEntry } from "../lib/types";
import { getToken } from "../lib/auth";
import { scheduleWorkbook } from "../lib/scheduleWorkbook";

type Props = {offForDate?:(date:string)=>string[];year:number;month:number;facility:string;schedules:ScheduleEntry[];disabled:boolean};
export default function ScheduleExport({offForDate=()=>[],year,month,facility,schedules,disabled}:Props) {
 const [open,setOpen]=useState(false);
 const label=new Date(year,month-1,1).toLocaleDateString(undefined,{month:"long",year:"numeric"});
 const prefix=`${year}-${String(month).padStart(2,"0")}`;
 const days=Array.from({length:new Date(year,month,0).getDate()},(_,i)=>{
  const date=`${prefix}-${String(i+1).padStart(2,"0")}`;
  const row=schedules.find(s=>s.date===date && s.facility===facility);
  return {date,day:i+1,off:offForDate(date),first:row?.callFirstName||"Unassigned",second:row?.callSecondName||"Unassigned"};
 });
 const missing=days.filter(d=>d.first==="Unassigned"||d.second==="Unassigned").length;
 const leading=new Date(year,month-1,1).getDay();
 const cells=[...Array.from({length:leading},()=>null),...days];
 while(cells.length%7)cells.push(null);
 const weeks=Array.from({length:cells.length/7},(_,i)=>cells.slice(i*7,i*7+7));
 function spreadsheet() {
  getToken();
  const bytes = scheduleWorkbook(year, month, facility, days);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const link=document.createElement('a');link.href=url;link.download=`A3i-call-schedule-${prefix}.xlsx`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }

 return <><div className="flex flex-wrap gap-2 mb-4"><button className="secondary-button" disabled={disabled} onClick={()=>{getToken();setOpen(true);}}>Print / Save PDF</button><button className="secondary-button" disabled={disabled} onClick={spreadsheet}>Download Excel calendar</button><span className="text-sm text-slate-600 self-center">Exports use saved assignments. Save your edits first.</span></div>
 {open&&createPortal(<div className="schedule-export-overlay" role="dialog" aria-modal="true" aria-label="Monthly schedule print preview">
  <div className="schedule-export-actions"><button className="primary-button" onClick={()=>{getToken();window.print();}}>Print or save as PDF</button><button className="secondary-button" autoFocus onClick={()=>setOpen(false)}>Close preview</button><p>Choose Landscape and “Save as PDF” in the print dialog. Turn off headers and footers for a clean copy.</p></div>
  <article className="schedule-export-sheet"><header><div><p>A3i · {facility}</p><h1>{label}</h1><h2>First & second call schedule</h2></div><div><strong>{missing?`Work in progress · ${missing} unfinished days`:'All days assigned · Saved copy'}</strong><p>Exported {new Date().toLocaleDateString()}</p></div></header>
   <table><thead><tr>{['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map(d=><th key={d}>{d}</th>)}</tr></thead><tbody>{weeks.map((week,i)=><tr key={i}>{week.map((day,j)=><td key={j} className={day?'':'empty'}>{day&&<><b>{day.day}</b><p><small>1st</small> {day.first}</p><p><small>2nd</small> {day.second}</p>{day.off.map(name=><p key={name}><small>OFF</small> {name}</p>)}</>}</td>)}</tr>)}</tbody></table>
   <footer>1st = first call · 2nd = second call. This is a snapshot of saved assignments; check A3i for subsequent changes.</footer>
  </article></div>,document.body)}
 </>;
}
