"use client";
import { useState } from "react";
import ScheduleExport from "./ScheduleExport";
import type { Facility } from "../lib/types";

export default function DriscollCalendar({ facility, onOpenWorkforce }: { facility: Facility | null; onOpenWorkforce:()=>void }) {
  const today = new Date();
  const [monthDate, setMonthDate] = useState(() => `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`);
  const [selectedDay, setSelectedDay] = useState(1);
  const [year, month] = monthDate.split("-").map(Number);
  const count = new Date(year, month, 0).getDate();
  const leading = new Date(year, month - 1, 1).getDay();
  const label = new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const dayLabel = new Date(year, month - 1, selectedDay).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const name = facility?.site_name || "Driscoll Pediatrics";
  const staffing = `${facility?.staffing_requirements?.md ?? 4} MDs / ${facility?.staffing_requirements?.crna ?? 5} CRNAs`;
  function chooseMonth(value: string) { if (/^\d{4}-\d{2}$/.test(value) && value >= "2000-01" && value <= "2100-12") { setMonthDate(value); setSelectedDay(1); } }
  function shiftMonth(delta: number) { const date = new Date(year, month - 1 + delta, 1); chooseMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`); }
  return <div className="schedule-workspace driscoll-workspace">
    <header className="schedule-heading"><div><p className="eyebrow">{name} · Pediatrics</p><h1>{label}</h1><p className="schedule-intro">Your pediatric call calendar. A clean starting point.</p></div>
      <label className="month-picker"><span className="sr-only">Driscoll calendar month</span><input aria-label="Driscoll calendar month" type="month" min="2000-01" max="2100-12" value={monthDate} onChange={event => chooseMonth(event.target.value)}/></label>
    </header>
    <div className="schedule-body">
      <div className="schedule-toolbar"><div className="template-status"><span>Blank template</span><small>No people assigned</small></div><details className="export-menu"><summary>Export Driscoll calendar <span aria-hidden="true">↓</span></summary><div><ScheduleExport year={year} month={month} facility={name} schedules={[]} disabled={false} template staffing={staffing}/></div></details></div>
      <div className="schedule-navigation"><span className="focus-note">Pediatric call coverage</span><button aria-label="Previous Driscoll month" disabled={monthDate === "2000-01"} onClick={() => shiftMonth(-1)}>‹</button><button onClick={() => chooseMonth(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`)}>This month</button><button aria-label="Next Driscoll month" disabled={monthDate === "2100-12"} onClick={() => shiftMonth(1)}>›</button></div>
      <div className="schedule-layout">
        <section className="calendar-surface" aria-label="Driscoll blank monthly call calendar">
          <div className="calendar-weekdays" aria-hidden="true">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <span key={day}>{day}</span>)}</div>
          <div className="calendar-grid">
            {Array.from({ length: leading }, (_, index) => <div key={`empty-${index}`} className="calendar-empty" aria-hidden="true"/>)}
            {Array.from({ length: count }, (_, index) => {
              const day = index + 1, weekday = new Date(year, month - 1, day).getDay();
              return <button key={day} className={`calendar-cell ${weekday === 0 || weekday === 6 ? "weekend" : ""} ${day === selectedDay ? "selected" : ""}`} aria-pressed={day === selectedDay} aria-label={`${new Date(year, month - 1, day).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}. Blank Driscoll template. No assignments.`} onClick={() => setSelectedDay(day)}><span className="calendar-date-row"><span className="date-number">{day}</span></span><span className="template-call-lines"><span>Call<span className="template-coverage-word"> coverage</span> <b>—</b></span><span>Off <b>—</b></span></span></button>;
            })}
          </div>
          <div className="calendar-legend"><span>Blank pediatric call calendar</span><span>No assignments have been created</span></div>
        </section>
        <aside className="schedule-detail" aria-label="Driscoll calendar setup"><section className="detail-card"><p className="eyebrow">Selected day</p><h2>{dayLabel}</h2><p className="template-description">Call coverage and Off will appear here when scheduling is enabled.</p><div className="template-staffing"><span>Daily staffing target</span><strong>{staffing}</strong><small>Separate from overnight call positions.</small></div><div className="template-next"><h3>Daily staffing is ready</h3><p>Use Workforce for Driscoll’s separate MD roster, daily staffing, CRNA relief, and Off. We still need to confirm call positions and weekend rules before enabling overnight call assignments.</p><button className="secondary-button" onClick={onOpenWorkforce}>Open Driscoll workforce</button></div></section></aside>
      </div>
    </div>
  </div>;
}
