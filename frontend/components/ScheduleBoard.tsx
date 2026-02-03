"use client";

import { useEffect, useMemo, useState } from "react";
import { DndContext, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import Calendar from "./Calendar";
import SortableShift from "./SortableShift";
import type { ScheduleEntry } from "../lib/types";
import { fetchSchedules, updateSchedule } from "../lib/api";
import { getRole, getToken } from "../lib/auth";

const fallbackSchedules: ScheduleEntry[] = [
  { date: "2026-01-01", facility: "Rio Hospital", mdIds: [1, 2], crnaIds: [] },
  { date: "2026-01-01", facility: "Rio Surgical Center", mdIds: [3], crnaIds: [10, 11, 12, 13] },
  { date: "2026-01-01", facility: "Driscoll Hospital (McAllen)", mdIds: [4], crnaIds: [14, 15] },
  { date: "2026-01-01", facility: "UTRGV Surgical Center", mdIds: [1], crnaIds: [10, 11, 12] }
];

export default function ScheduleBoard() {
  const [view, setView] = useState<"month" | "day">("month");
  const [selectedDate, setSelectedDate] = useState("2026-01-01");
  const [schedules, setSchedules] = useState<ScheduleEntry[]>(fallbackSchedules);
  const role = getRole();

  useEffect(() => {
    const token = getToken();
    fetchSchedules(token)
      .then((data) => {
        if (data.length > 0) {
          setSchedules(data);
          setSelectedDate(data[0].date);
        }
      })
      .catch(() => undefined);
  }, []);

  const daySchedules = useMemo(
    () => schedules.filter((entry) => entry.date === selectedDate),
    [schedules, selectedDate]
  );

  const sortableIds = daySchedules.map((entry) => `${entry.date}-${entry.facility}`);

  const handleDragEnd = (event: DragEndEvent) => {
    if (role !== "admin") {
      return;
    }
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = sortableIds.indexOf(String(active.id));
    const newIndex = sortableIds.indexOf(String(over.id));
    const updated = arrayMove(daySchedules, oldIndex, newIndex);
    const remaining = schedules.filter((entry) => entry.date !== selectedDate);
    setSchedules([...remaining, ...updated]);

    const schedule = updated[newIndex];
    if (schedule.id) {
      updateSchedule(schedule.id, schedule, getToken()).catch(() => undefined);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Schedule</h2>
          <p className="text-sm text-slate-600">Manage monthly coverage by facility.</p>
        </div>
        <div className="flex gap-2">
          <button
            className={`rounded-full px-3 py-1 text-sm ${view === "month" ? "bg-slate-900 text-white" : "bg-white border"}`}
            onClick={() => setView("month")}
          >
            Month
          </button>
          <button
            className={`rounded-full px-3 py-1 text-sm ${view === "day" ? "bg-slate-900 text-white" : "bg-white border"}`}
            onClick={() => setView("day")}
          >
            Day
          </button>
        </div>
      </div>

      <Calendar
        schedules={schedules}
        view={view}
        selectedDate={selectedDate}
        onSelectDate={(date) => {
          setSelectedDate(date);
          setView("day");
        }}
      />

      {view === "day" && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Drag & drop shifts</h3>
          <DndContext onDragEnd={handleDragEnd}>
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {daySchedules.map((entry) => (
                  <SortableShift
                    key={`${entry.date}-${entry.facility}`}
                    id={`${entry.date}-${entry.facility}`}
                    title={entry.facility}
                    subtitle={`MDs: ${entry.mdIds.join(", ") || "TBD"} | CRNAs: ${entry.crnaIds.join(", ") || "TBD"}`}
                    disabled={role !== "admin"}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  );
}
