"use client";

import { compareMdNames, mdSchedulingName } from "../lib/mdNames";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchFacilities, fetchMds, scoreSchedule } from "../lib/api";
import { getToken } from "../lib/auth";
import type { ScheduleScoreResponse } from "../lib/types";

const RIO_FACILITY = "Rio Grande Regional Hospital";

export default function AnalyticsPanel() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [scoreData, setScoreData] = useState<ScheduleScoreResponse | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const latestRequest = useRef(0);

  const runAnalytics = useCallback(async () => {
    const requestId = ++latestRequest.current;
    if (!Number.isInteger(year) || year < 2024 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      setStatus("Choose a valid month and year.");
      setScoreData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const token = getToken();
      const [facilities, roster] = await Promise.all([
        fetchFacilities(token),
        fetchMds(token),
      ]);
      if (requestId !== latestRequest.current) return;
      const facility = facilities.find(site => site.site_name === RIO_FACILITY);
      if (!facility) throw new Error("Rio Grande facility not found.");
      const result = await scoreSchedule(facility.id, year, month, token);
      if (requestId !== latestRequest.current) return;
      const byId = new Map(result.per_md.map(row => [row.md_id, row]));
      const activeIds = new Set(roster.filter(md => md.active !== false).map(md => md.id));
      const rows = roster.filter(md => md.active !== false).map(md => ({
        md_id: md.id,
        first_call_count: 0,
        second_call_count: 0,
        weekend_count: 0,
        back_to_back_first_count: 0,
        back_to_back_weekend_count: 0,
        total_call: 0,
        score: 0,
        ...byId.get(md.id),
        name: md.name,
      }));
      // Keep earlier calls readable when a doctor has since left the active list.
      const earlier = result.per_md.filter(row => !activeIds.has(row.md_id) && row.total_call > 0)
        .map(row => ({ ...row, name: roster.find(md => md.id === row.md_id)?.name || row.name }));
      setScoreData({ ...result, per_md: [...rows, ...earlier] });
    } catch (error) {
      if (requestId !== latestRequest.current) return;
      setStatus((error as Error).message || "Failed to load analytics.");
      setScoreData(null);
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    runAnalytics().catch(() => undefined);
    return () => { latestRequest.current += 1; };
  }, [runAnalytics]);

  return (
    <section className="surface-card rounded-xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Analytics</h2>
          <p className="text-sm text-slate-600">
            Your full Rio MD list, including zero calls. Most calls first.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <input
            aria-label="Workload year"
            type="number"
            min={2024}
            max={2100}
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            className="w-24 rounded border border-slate-300 px-2 py-1"
          />
          <input
            aria-label="Workload month"
            type="number"
            min={1}
            max={12}
            value={month}
            onChange={(event) => setMonth(Number(event.target.value))}
            className="w-16 rounded border border-slate-300 px-2 py-1"
          />
          <button
            onClick={() => runAnalytics()}
            className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-700"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading && <p className="mt-3 text-sm text-slate-500">Loading analytics...</p>}
      {status && <p className="mt-3 text-sm text-rose-600">{status}</p>}

      {scoreData && (
        <div className="mt-4 space-y-3">
          <div className="grid gap-2 text-xs text-slate-700 md:grid-cols-4">
            <div className="rounded border border-slate-200 p-2">Mean score: {scoreData.summary.mean_score.toFixed(3)}</div>
            <div className="rounded border border-slate-200 p-2">Std dev: {scoreData.summary.stdev_score.toFixed(3)}</div>
            <div className="rounded border border-slate-200 p-2">Min score: {scoreData.summary.min.toFixed(3)}</div>
            <div className="rounded border border-slate-200 p-2">Max score: {scoreData.summary.max.toFixed(3)}</div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-left">
                  <th className="px-2 py-1">MD</th>
                  <th className="px-2 py-1">First call</th>
                  <th className="px-2 py-1">Second call</th>
                  <th className="px-2 py-1">Weekends</th>
                  <th className="px-2 py-1">Consecutive first calls</th>
                  <th className="px-2 py-1">Consecutive weekends</th>
                  <th className="px-2 py-1">Total</th>
                  <th className="px-2 py-1">Score</th>
                </tr>
              </thead>
              <tbody>
                {scoreData.per_md
                  .slice()
                  .sort((a, b) => b.total_call - a.total_call || compareMdNames(a.name, b.name))
                  .map((row) => (
                    <tr key={row.md_id} className="border-b border-slate-100">
                      <td className="px-2 py-1">{mdSchedulingName(row.name)}</td>
                      <td className="px-2 py-1">{row.first_call_count}</td>
                      <td className="px-2 py-1">{row.second_call_count}</td>
                      <td className="px-2 py-1">{row.weekend_count}</td>
                      <td className="px-2 py-1">{row.back_to_back_first_count}</td>
                      <td className="px-2 py-1">{row.back_to_back_weekend_count}</td>
                      <td className="px-2 py-1">{row.total_call}</td>
                      <td className="px-2 py-1 font-semibold">{row.score.toFixed(2)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
