import type { ScheduleEntry } from "../lib/types";
type Props={schedules:ScheduleEntry[];view:"month"|"day";selectedDate:string;onSelectDate:(date:string)=>void};
export default function Calendar({schedules,selectedDate,onSelectDate}:Props){
 const [year,month]=selectedDate.split("-").map(Number);
 const count=new Date(year,month,0).getDate();
 const leading=new Date(year,month-1,1).getDay();
 const now=new Date();const today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
 const byDate=new Map(schedules.map(s=>[s.date,s]));
 return <section className="calendar-surface" aria-label="Monthly call schedule">
  <div className="calendar-weekdays" aria-hidden="true">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><span key={d}>{d}</span>)}</div>
  <div className="calendar-grid">
   {Array.from({length:leading},(_,i)=><div key={`empty-${i}`} className="calendar-empty" aria-hidden="true"/>)}
   {Array.from({length:count},(_,i)=>{const day=i+1;const date=`${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;const entry=byDate.get(date);const weekday=new Date(year,month-1,day).getDay();const label=new Date(year,month-1,day).toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"});return <button key={date} className={`calendar-cell ${weekday===0||weekday===6?"weekend":""} ${date===selectedDate?"selected":""}`} onClick={()=>onSelectDate(date)} aria-pressed={date===selectedDate} aria-label={`${label}. First call: ${entry?.callFirstName||"Unassigned"}. Second call: ${entry?.callSecondName||"Unassigned"}.`}>
    <span className={`date-number ${date===today?"is-today":""}`}>{day}<span className="mobile-weekday">{new Date(year,month-1,day).toLocaleDateString(undefined,{weekday:"short"})}</span></span>
    {entry&&(entry.callFirstName||entry.callSecondName)?<span className="call-lines"><span className="first-call"><small>1st</small>{entry.callFirstName||"Unassigned"}</span><span className="second-call"><small>2nd</small>{entry.callSecondName||"Unassigned"}</span></span>:<span className="unassigned">No assignment</span>}
   </button>})}
  </div><div className="calendar-legend"><span><i/> First call</span><span>2nd · Second call</span><span>Select a day to review coverage</span></div>
 </section>;
}
