"use client";

import { useEffect, useMemo, useState } from "react";
import Calendar from "./Calendar";
import type { ScheduleEntry } from "../lib/types";
import {
  fetchMds,
  fetchSchedules,
  generateSchedule,
  updateSchedule
} from "../lib/api";
import { getRole, getToken } from "../lib/auth";

const RIO_FACILITY = "Rio Grande Regional Hospital";

const fallbackSchedules: ScheduleEntry[] = [
  { date: "2026-03-01", facility: RIO_FACILITY, mdIds: [1, 2], crnaIds: [] }
];

export default function ScheduleBoard() {
  const [view, setView] = useState<"month" | "day">("month");
  const [selectedDate, setSelectedDate] = useState("2026-03-01");
  const [schedules, setSchedules] = useState<ScheduleEntry[]>(fallbackSchedules);
  const [month, setMonth] = useState(3);
  const [year, setYear] = useState(2026);
  const [overwrite, setOverwrite] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "read-only">("read-only");
  const [mdMap, setMdMap] = useState<Record<number, string>>({});
  const [editCallFirst, setEditCallFirst] = useState<number | null>(null);
  const [editCallSecond, setEditCallSecond] = useState<number | null>(null);

  const loadSchedules = () => {
    const token = getToken();
    return fetchSchedules(token)
      .then((data) => {
        const rioOnly = data.filter((entry) => entry.facility === RIO_FACILITY);
        if (rioOnly.length > 0) {
          const hydrated = rioOnly.map((entry) => {
            const firstId = entry.callAssignments?.first_call_md_id ?? null;
            const secondId = entry.callAssignments?.second_call_md_id ?? null;
            return {
              ...entry,
              mdNames: entry.mdIds.map((id) => mdMap[id]).filter(Boolean),
              callFirstName: firstId ? mdMap[firstId] || String(firstId) : undefined,
              callSecondName: secondId ? mdMap[secondId] || String(secondId) : undefined
            };
          });
          setSchedules(hydrated);
        }
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    setRole(getRole());
    const token = getToken();
    Promise.all([fetchMds(token)])
      .then(([mds]) => {
        const mdLookup: Record<number, string> = {};
        mds.forEach((md) => {
          mdLookup[md.id] = md.name;
        });
        setMdMap(mdLookup);
      })
      .finally(() => {
        loadSchedules();
      });
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
            callFirstName: firstId ? mdMap[firstId] || String(firstId) : undefined,
            callSecondName: secondId ? mdMap[secondId] || String(secondId) : undefined
          };
        }),
    [schedules, mdMap]
  );

  const daySchedules = useMemo(
    () => hydratedSchedules.filter((entry) => entry.date === selectedDate),
    [hydratedSchedules, selectedDate]
  );

  useEffect(() => {
    const entry = hydratedSchedules.find((item) => item.date === selectedDate);
    if (entry?.callAssignments) {
      setEditCallFirst(entry.callAssignments.first_call_md_id ?? null);
      setEditCallSecond(entry.callAssignments.second_call_md_id ?? null);
    }
  }, [selectedDate, hydratedSchedules]);

  const postCallName = useMemo(() => {
    const currentDate = new Date(selectedDate);
    currentDate.setDate(currentDate.getDate() - 1);
    const priorDate = currentDate.toISOString().slice(0, 10);
    const priorEntry = hydratedSchedules.find((entry) => entry.date === priorDate);
    const postCallId = priorEntry?.callAssignments?.first_call_md_id;
    if (!postCallId) {
      return "TBD";
    }
    return mdMap[postCallId] || String(postCallId);
  }, [selectedDate, hydratedSchedules, mdMap]);


  return (
    <div className="space-y-6">
      <div className="surface-card flex items-center justify-between rounded-xl p-4">
        <div>
          <h2 className="text-xl font-semibold">Schedule</h2>
          <p className="text-sm text-slate-600">Manage Rio Grande Regional Hospital MD call coverage.</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span>Selected:</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => {
              setSelectedDate(event.target.value);
              setView("day");
            }}
            className="rounded border border-slate-200 px-2 py-1 text-sm"
          />
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

      <div className="surface-card rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <label className="text-slate-600">Month</label>
            <input
              type="number"
              min={1}
              max={12}
              value={month}
              onChange={(event) => setMonth(Number(event.target.value))}
              className="w-16 rounded border border-slate-200 px-2 py-1"
            />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <label className="text-slate-600">Year</label>
            <input
              type="number"
              min={2024}
              max={2100}
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
              className="w-24 rounded border border-slate-200 px-2 py-1"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(event) => setOverwrite(event.target.checked)}
            />
            Overwrite existing
          </label>
          <button
            className="rounded-full bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            disabled={role !== "admin"}
            onClick={async () => {
              setStatus(null);
              try {
                await generateSchedule(year, month, overwrite, getToken() || undefined);
                await loadSchedules();
                const paddedMonth = String(month).padStart(2, "0");
                setSelectedDate(`${year}-${paddedMonth}-01`);
                setStatus("Schedule generated.");
              } catch (error) {
                setStatus((error as Error).message);
              }
            }}
          >
            Generate Schedule
          </button>
          {role !== "admin" && <span className="text-xs text-slate-500">Admin only</span>}
        </div>
        {status && <p className="mt-2 text-sm text-slate-600">{status}</p>}
      </div>

      <div className="surface-card rounded-xl p-4 text-sm text-slate-700">
        <p className="font-semibold">Quick steps</p>
        <ol className="mt-2 list-decimal pl-5">
          <li>Pick month/year and click Generate Schedule.</li>
          <li>Switch to Day view and choose a date.</li>
          <li>Edit call assignments in the Call section.</li>
        </ol>
      </div>

      <Calendar
        schedules={hydratedSchedules}
        view={view}
        selectedDate={selectedDate}
        onSelectDate={(date) => {
          setSelectedDate(date);
          setView("day");
        }}
      />

      {view === "day" && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Call schedule</h3>
          {daySchedules.length === 0 && (
            <p className="text-sm text-slate-500">No schedule entries for this day.</p>
          )}
          {daySchedules[0]?.callAssignments && (
            <div className="surface-card rounded-lg p-3 text-sm text-slate-700">
              <p className="font-semibold">Call Assignments</p>
              <p>
                1st Call:{" "}
                {mdMap[daySchedules[0].callAssignments?.first_call_md_id || 0] ||
                  daySchedules[0].callAssignments?.first_call_md_id ||
                  "TBD"}
              </p>
              <p>
                2nd Call:{" "}
                {mdMap[daySchedules[0].callAssignments?.second_call_md_id || 0] ||
                  daySchedules[0].callAssignments?.second_call_md_id ||
                  "TBD"}
              </p>
              <p>Post Call: {postCallName}</p>
              {role === "admin" && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="text-xs text-slate-500">Edit call:</label>
                  <select
                    className="rounded border border-slate-200 px-2 py-1 text-sm"
                    value={editCallFirst ?? ""}
                    onChange={(event) => setEditCallFirst(Number(event.target.value))}
                  >
                    <option value="">1st Call</option>
                    {Object.entries(mdMap).map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="rounded border border-slate-200 px-2 py-1 text-sm"
                    value={editCallSecond ?? ""}
                    onChange={(event) => setEditCallSecond(Number(event.target.value))}
                  >
                    <option value="">2nd Call</option>
                    {Object.entries(mdMap).map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="rounded bg-slate-900 px-3 py-1 text-xs text-white"
                    onClick={async () => {
                      const payload = {
                        first_call_md_id: editCallFirst,
                        second_call_md_id: editCallSecond
                      };
                      await Promise.all(
                        daySchedules
                          .filter((entry) => entry.id)
                          .map((entry) =>
                            updateSchedule(
                              entry.id as number,
                              { callAssignments: payload },
                              getToken() || undefined
                            )
                          )
                      );
                      await loadSchedules();
                    }}
                  >
                    Save call
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="space-y-2">
            {daySchedules.map((entry) => (
              <div key={`${entry.date}-${entry.facility}`} className="surface-card rounded-lg p-3">
                <div>
                  <p className="font-semibold">{entry.facility}</p>
                  <p className="text-xs text-slate-600">
                    MDs: {entry.mdNames?.join(", ") || entry.mdIds.join(", ") || "TBD"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
