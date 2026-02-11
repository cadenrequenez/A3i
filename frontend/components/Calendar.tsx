import { useMemo } from "react";
import type { FacilityColorMap, ScheduleEntry } from "../lib/types";

const facilityColors: FacilityColorMap = {
  "Rio Grande Regional Hospital": "bg-rose-500",
  "Rio Grande Regional Surgical Center": "bg-indigo-500",
  "Driscoll Children's Hospital (McAllen)": "bg-emerald-500",
  "UTRGV Surgical Center": "bg-amber-500"
};

type CalendarProps = {
  schedules: ScheduleEntry[];
  view: "month" | "day";
  selectedDate: string;
  onSelectDate: (date: string) => void;
};

function toLocalDateString(value: Date) {
  return value.toLocaleDateString("en-CA");
}

function buildMonthGrid(currentDate: Date) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  const days: Date[] = [];
  const cursor = new Date(start);
  while (cursor <= last || cursor.getDay() !== 0) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export default function Calendar({ schedules, view, selectedDate, onSelectDate }: CalendarProps) {
  const currentDate = new Date(selectedDate);
  const monthGrid = useMemo(() => buildMonthGrid(currentDate), [currentDate]);

  if (view === "day") {
    const daySchedules = schedules.filter((s) => s.date === selectedDate);
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Schedule for {selectedDate}</h3>
        {daySchedules.map((entry) => (
          <div key={`${entry.facility}-${entry.date}`} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <span className={`h-3 w-3 rounded-full ${facilityColors[entry.facility] || "bg-slate-400"}`} />
            <div>
              <p className="text-sm font-semibold">{entry.facility}</p>
              <p className="text-xs text-slate-600">
                1st Call: {entry.callFirstName || "TBD"}
              </p>
              <p className="text-xs text-slate-600">
                2nd Call: {entry.callSecondName || "TBD"}
              </p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-7 gap-2">
      {monthGrid.map((day) => {
        const iso = toLocalDateString(day);
        const daySchedules = schedules.filter((s) => s.date === iso);
        const rioEntry = daySchedules.find((s) => s.facility === "Rio Grande Regional Hospital");
        return (
          <button
            key={iso}
            onClick={() => onSelectDate(iso)}
            className={`rounded-lg border p-2 text-left text-sm ${
              iso === selectedDate ? "border-slate-900 bg-white" : "border-slate-200 bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold">{day.getDate()}</span>
              <span className="text-xs text-slate-400">{day.toLocaleDateString(undefined, { weekday: "short" })}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {daySchedules.map((entry) => (
                <span
                  key={`${entry.facility}-${entry.date}`}
                  className={`h-2 w-2 rounded-full ${facilityColors[entry.facility] || "bg-slate-400"}`}
                  title={entry.facility}
                />
              ))}
            </div>
            {rioEntry && (
              <div className="mt-2 space-y-1 text-[11px] text-slate-600">
                <div>1st: {rioEntry.callFirstName || "TBD"}</div>
                <div>2nd: {rioEntry.callSecondName || "TBD"}</div>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
