import type { ScheduleEntry } from "../lib/types";
export type CallFocus = "all" | "first" | "second";
type Props = { offForDate?: (date: string) => string[]; schedules: ScheduleEntry[]; view: "month" | "day"; selectedDate: string; focus?: CallFocus; onSelectDate: (date: string) => void };
export default function Calendar({ offForDate = () => [], schedules, selectedDate, focus = "all", onSelectDate }: Props) {
 const [year, month] = selectedDate.split("-").map(Number);
 const count = new Date(year, month, 0).getDate(), leading = new Date(year, month - 1, 1).getDay();
 const now = new Date(), today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
 const byDate = new Map(schedules.map(s => [s.date, s]));
 return <section className="calendar-surface" aria-label="Monthly call schedule">
  <div className="calendar-weekdays" aria-hidden="true">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <span key={d}>{d}</span>)}</div>
  <div className="calendar-grid">
   {Array.from({ length: leading }, (_, i) => <div key={`empty-${i}`} className="calendar-empty" aria-hidden="true"/>)}
   {Array.from({ length: count }, (_, i) => {
    const day = i + 1, date = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const entry = byDate.get(date), weekday = new Date(year, month-1, day).getDay();
    const label = new Date(year, month-1, day).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    const assigned = Number(Boolean(entry?.callFirstName)) + Number(Boolean(entry?.callSecondName));
    const off = offForDate(date);
    return <button key={date} className={`calendar-cell ${weekday===0||weekday===6?"weekend":""} ${date===selectedDate?"selected":""}`} onClick={() => onSelectDate(date)} aria-pressed={date===selectedDate} aria-label={`${label}. First call: ${entry?.callFirstName||"Unassigned"}. Second call: ${entry?.callSecondName||"Unassigned"}. Off: ${off.join(", ")||"none"}.`}>
     <span className="calendar-date-row"><span className={`date-number ${date===today?"is-today":""}`}>{day}</span>{assigned>0&&<span aria-hidden="true" className={`coverage-dot ${assigned===1?"partial":""}`}/>}</span>
     <span className="call-lines">{focus!=="second"&&<span className={`first-call ${!entry?.callFirstName?"call-empty":""}`}><small>1st</small><span>{entry?.callFirstName||"—"}</span></span>}{focus!=="first"&&<span className={`second-call ${!entry?.callSecondName?"call-empty":""}`}><small>2nd</small><span>{entry?.callSecondName||"—"}</span></span>}</span>
     {off.length>0&&<span className="calendar-off">{off.map(name=><span key={name}>Off · {name}</span>)}</span>}
    </button>;
   })}
  </div><div className="calendar-legend"><span><i className="complete"/> Both calls saved</span><span><i className="partial"/> Partially assigned</span><span>Select any day to edit</span></div>
 </section>;
}
