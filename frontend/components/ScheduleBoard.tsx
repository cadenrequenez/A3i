"use client";

import { useEffect, useMemo, useState } from "react";
import Calendar from "./Calendar";
import type { AIFixSuggestion, ScheduleEntry } from "../lib/types";
import {
  fetchFacilities,
  fetchMds,
  fetchSchedules,
  generateSchedule,
  suggestScheduleFixes,
  updateSchedule
} from "../lib/api";
import { getRole, getToken } from "../lib/auth";

const RIO_FACILITY = "Rio Grande Regional Hospital";

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function ScheduleBoard() {
  const todayIso = formatIsoDate(new Date());
  const [view, setView] = useState<"month" | "day">("month");
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [month, setMonth] = useState(Number(todayIso.slice(5, 7)));
  const [year, setYear] = useState(Number(todayIso.slice(0, 4)));
  const [overwrite, setOverwrite] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "read-only">("read-only");
  const [mdMap, setMdMap] = useState<Record<number, string>>({});
  const [editCallFirst, setEditCallFirst] = useState<number | null>(null);
  const [editCallSecond, setEditCallSecond] = useState<number | null>(null);
  const [isGeneratingYear, setIsGeneratingYear] = useState(false);
  const [rioFacilityId, setRioFacilityId] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<AIFixSuggestion[]>([]);
  const [suggestionStatus, setSuggestionStatus] = useState<string | null>(null);

  const loadSchedules = () => {
    const token = getToken();
    return fetchSchedules(token)
      .then((data) => {
        const rioOnly = data.filter((entry) => entry.facility === RIO_FACILITY);
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
        if (hydrated.length > 0 && !hydrated.some((entry) => entry.date === selectedDate)) {
          const firstDate = hydrated[0].date;
          setSelectedDate(firstDate);
          setMonth(Number(firstDate.slice(5, 7)));
          setYear(Number(firstDate.slice(0, 4)));
        }
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    setRole(getRole());
    const token = getToken();
    Promise.all([fetchMds(token), fetchFacilities(token)])
      .then(([mds, facilities]) => {
        const mdLookup: Record<number, string> = {};
        mds.forEach((md) => {
          mdLookup[md.id] = md.name;
        });
        setMdMap(mdLookup);
        const rioFacility = facilities.find((item) => item.site_name === RIO_FACILITY);
        setRioFacilityId(rioFacility?.id ?? null);
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

  const shiftMonth = (delta: number) => {
    const current = parseIsoDate(selectedDate);
    current.setMonth(current.getMonth() + delta);
    current.setDate(1);
    const nextDate = formatIsoDate(current);
    setSelectedDate(nextDate);
    setMonth(Number(nextDate.slice(5, 7)));
    setYear(Number(nextDate.slice(0, 4)));
    setView("month");
  };

  const generateFullYear = async () => {
    const token = getToken() || undefined;
    if (!token) {
      setStatus("Missing auth token.");
      return;
    }
    setIsGeneratingYear(true);
    setStatus(`Generating all months for ${year}...`);
    try {
      for (let m = 1; m <= 12; m += 1) {
        await generateSchedule(year, m, overwrite, token);
      }
      await loadSchedules();
      setSelectedDate(`${year}-01-01`);
      setMonth(1);
      setView("month");
      setStatus(`Generated schedule for all 12 months of ${year}.`);
    } catch (error) {
      setStatus((error as Error).message || "Failed to generate full year.");
    } finally {
      setIsGeneratingYear(false);
    }
  };

  const postCallName = useMemo(() => {
    const currentDate = parseIsoDate(selectedDate);
    currentDate.setDate(currentDate.getDate() - 1);
    const priorDate = formatIsoDate(currentDate);
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
              const nextDate = event.target.value;
              setSelectedDate(nextDate);
              setMonth(Number(nextDate.slice(5, 7)));
              setYear(Number(nextDate.slice(0, 4)));
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
              onChange={(event) => {
                const nextMonth = Number(event.target.value);
                if (Number.isNaN(nextMonth) || nextMonth < 1 || nextMonth > 12) {
                  return;
                }
                setMonth(nextMonth);
                setSelectedDate(`${year}-${String(nextMonth).padStart(2, "0")}-01`);
                setView("month");
              }}
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
              onChange={(event) => {
                const nextYear = Number(event.target.value);
                if (Number.isNaN(nextYear) || nextYear < 2024 || nextYear > 2100) {
                  return;
                }
                setYear(nextYear);
                setSelectedDate(`${nextYear}-${String(month).padStart(2, "0")}-01`);
                setView("month");
              }}
              className="w-24 rounded border border-slate-200 px-2 py-1"
            />
          </div>
          <button
            className="rounded-full border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
            onClick={() => shiftMonth(-1)}
          >
            Prev month
          </button>
          <button
            className="rounded-full border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
            onClick={() => shiftMonth(1)}
          >
            Next month
          </button>
          <button
            className="rounded-full border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
            onClick={() => {
              setSelectedDate(todayIso);
              setMonth(Number(todayIso.slice(5, 7)));
              setYear(Number(todayIso.slice(0, 4)));
              setView("month");
            }}
          >
            Jump to today
          </button>
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
                setView("month");
                setStatus(`Schedule generated for ${year}-${paddedMonth}.`);
              } catch (error) {
                setStatus((error as Error).message);
              }
            }}
          >
            Generate Schedule
          </button>
          <button
            className="rounded-full bg-sky-800 px-4 py-2 text-sm text-white disabled:opacity-50"
            disabled={role !== "admin" || isGeneratingYear}
            onClick={generateFullYear}
          >
            {isGeneratingYear ? "Generating Year..." : "Generate Full Year"}
          </button>
          <button
            className="rounded-full bg-emerald-700 px-4 py-2 text-sm text-white disabled:opacity-50"
            disabled={role !== "admin" || !rioFacilityId}
            onClick={async () => {
              setSuggestionStatus("Requesting AI suggestions...");
              try {
                if (!rioFacilityId) {
                  throw new Error("Rio facility not found");
                }
                const result = await suggestScheduleFixes(rioFacilityId, year, month, getToken() || undefined);
                setSuggestions(result.suggestions);
                setSuggestionStatus(
                  result.suggestions.length
                    ? `Found ${result.suggestions.length} validated suggestions.`
                    : "No valid suggestions returned."
                );
              } catch (error) {
                setSuggestionStatus((error as Error).message || "Failed to load suggestions.");
              }
            }}
          >
            Suggest fixes
          </button>
          {role !== "admin" && <span className="text-xs text-slate-500">Admin only</span>}
        </div>
        {status && <p className="mt-2 text-sm text-slate-600">{status}</p>}
        {suggestionStatus && <p className="mt-1 text-sm text-slate-600">{suggestionStatus}</p>}
      </div>

      {suggestions.length > 0 && (
        <div className="surface-card rounded-xl p-4">
          <h3 className="text-lg font-semibold">AI Suggestions Preview</h3>
          <p className="mt-1 text-sm text-slate-600">Preview only. Suggestions are not saved automatically.</p>
          <div className="mt-3 space-y-3">
            {suggestions.map((item, index) => (
              <div key={`${item.title}-${index}`} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                <p className="font-semibold">{item.title}</p>
                <p className="text-slate-600">{item.rationale}</p>
                {item.why && <p className="mt-1 text-xs text-slate-600">{item.why}</p>}
                {item.impact_summary && (
                  <p className="mt-1 text-xs text-slate-600">
                    <span className="font-medium">Impact:</span> {item.impact_summary}
                  </p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  Expected delta: {item.expected_fairness_delta.toFixed(3)} | Actual delta: {item.actual_fairness_delta.toFixed(3)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Fixed: {item.violations_fixed.join(", ") || "none"} | Added: {item.violations_added.join(", ") || "none"}
                </p>
                <ul className="mt-2 list-disc pl-5 text-xs text-slate-600">
                  {item.changes.map((change) => (
                    <li key={`${change.date}-${change.set_first_call_md_id}-${change.set_second_call_md_id}`}>
                      {change.date}: 1st {mdMap[change.set_first_call_md_id] || change.set_first_call_md_id}, 2nd{" "}
                      {mdMap[change.set_second_call_md_id] || change.set_second_call_md_id}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="surface-card rounded-xl p-4 text-sm text-slate-700">
        <p className="font-semibold">Quick steps</p>
        <ol className="mt-2 list-decimal pl-5">
          <li>Pick month/year and click Generate Schedule.</li>
          <li>Use Prev/Next month to move fast across months.</li>
          <li>Switch to Day view, pick a date, and edit call assignments.</li>
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
                      setStatus(null);
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
                      setStatus("Call assignments saved.");
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
