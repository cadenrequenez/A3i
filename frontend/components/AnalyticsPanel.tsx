"use client";

import { useEffect, useState } from "react";
import { fetchFacilities, scoreSchedule } from "../lib/api";
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
  const [facilityId, setFacilityId] = useState<number | null>(null);

  useEffect(() => {
    const token = getToken();
    fetchFacilities(token)
      .then((rows) => {
        const rio = rows.find((item) => item.site_name === RIO_FACILITY);
        setFacilityId(rio?.id ?? null);
      })
      .catch(() => setStatus("Failed to load facilities."));
  }, []);

  const runAnalytics = async () => {
    if (!facilityId) {
      setStatus("Rio Grande facility not found.");
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const result = await scoreSchedule(facilityId, year, month, getToken() || undefined);
      setScoreData(result);
    } catch (error) {
      setStatus((error as Error).message || "Failed to load analytics.");
      setScoreData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (facilityId) {
      runAnalytics().catch(() => undefined);
    }
  }, [facilityId, year, month]);

  return (
    <section className="surface-card rounded-xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Analytics</h2>
          <p className="text-sm text-slate-600">
            Fairness score and MD call distribution for the selected month.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <input
            type="number"
            min={2024}
            max={2100}
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            className="w-24 rounded border border-slate-300 px-2 py-1"
          />
          <input
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
                  <th className="px-2 py-1">1st</th>
                  <th className="px-2 py-1">2nd</th>
                  <th className="px-2 py-1">Weekends</th>
                  <th className="px-2 py-1">B2B 1st</th>
                  <th className="px-2 py-1">B2B Wknd</th>
                  <th className="px-2 py-1">Total</th>
                  <th className="px-2 py-1">Score</th>
                </tr>
              </thead>
              <tbody>
                {scoreData.per_md
                  .slice()
                  .sort((a, b) => b.score - a.score)
                  .map((row) => (
                    <tr key={row.md_id} className="border-b border-slate-100">
                      <td className="px-2 py-1">{row.name}</td>
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
