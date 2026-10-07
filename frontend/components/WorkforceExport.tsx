"use client";
import { useEffect, useState, useRef } from "react";
import type { ReactNode, ReactPortal } from "react";
const { createPortal } = require("react-dom") as {
  createPortal: (children: ReactNode, container: Element) => ReactPortal;
};
import type { Facility } from "../lib/types";
import { workforceDate, type WorkforceMonth } from "../lib/workforce";
import {
  reliefLabel,
  workforceSiteName,
  workforceWorkbook,
} from "../lib/workforceWorkbook";
export default function WorkforceExport({
  month,
  sites,
  onClose,
}: {
  month: WorkforceMonth;
  sites: Facility[];
  onClose: () => void;
}) {
  const [ready, setReady] = useState(false),
    [view, setView] = useState("workforce");
  const overlay = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ready) return;
    const previous = document.activeElement as HTMLElement | null;
    const root = overlay.current;
    if (!root) return;
    const focusable = () =>
      Array.from(
        root.querySelectorAll<HTMLElement>('button,select,[tabindex="0"]'),
      ).filter((e) => !(e as HTMLButtonElement).disabled);
    focusable()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const els = focusable(),
        first = els[0],
        last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    root.addEventListener("keydown", trap);
    return () => {
      root.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [ready]);
  useEffect(() => {
    setReady(true);
    document.body.classList.add("wf-export-open");
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => {
      document.body.classList.remove("wf-export-open");
      window.removeEventListener("keydown", close);
    };
  }, [onClose]);
  const count = new Date(month.year, month.month, 0).getDate(),
    label = new Date(month.year, month.month - 1, 1).toLocaleDateString(
      "en-US",
      { month: "long", year: "numeric" },
    );
  const perPage = view === "relief" ? 4 : view === "workforce" ? 3 : 7;
  const chunks = Array.from({ length: Math.ceil(count / perPage) }, (_, i) =>
    Array.from(
      { length: Math.min(perPage, count - i * perPage) },
      (_, j) => i * perPage + j + 1,
    ),
  );
  const selected = sites.filter(
    (s) => view === "workforce" || String(s.id) === view,
  );
  function download() {
    const bytes = workforceWorkbook(month, sites),
      url = URL.createObjectURL(
        new Blob([bytes as BlobPart], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
    const a = document.createElement("a");
    a.href = url;
    a.download = `A3i-workforce-${month.year}-${String(month.month).padStart(2, "0")}.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (!ready) return null;
  return createPortal(
    <div
      ref={overlay}
      className="wf-export-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Workforce export preview"
    >
      <div className="wf-export-actions">
        <label>
          Print section{" "}
          <select value={view} onChange={(e) => setView(e.target.value)}>
            <option value="workforce">All sites workforce</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {workforceSiteName(s)} workforce
              </option>
            ))}
            <option value="relief">CRNA order of relief</option>
          </select>
        </label>
        <button onClick={() => window.print()}>Print / Save PDF</button>
        <button onClick={download}>Download Excel · All sheets</button>
        <button onClick={onClose}>Close</button>
        <p>
          Saved assignments only. Drafts stay labelled. Excel changes do not
          update A3i.
        </p>
      </div>
      {chunks.map((days, page) => (
        <section
          className={`wf-print-sheet ${view === "relief" ? "is-relief" : ""}`}
          key={page}
        >
          <header>
            <div>
              <p>
                A3i ·{" "}
                {view === "relief"
                  ? "CRNA order of relief"
                  : selected.length === 1
                    ? `${workforceSiteName(selected[0])} workforce`
                    : "Daily workforce"}
              </p>
              <h1>{label}</h1>
            </div>
            <span>
              {month.status === "ready"
                ? "READY TO SHARE"
                : "DRAFT · IN PROGRESS"}
            </span>
          </header>
          <p className="wf-print-meta">
            {days[0]}–{days[days.length - 1]} · * Driscoll · ** UTRGV · (ASC)
            ASC · Timing notes as entered
          </p>
          {view === "relief" ? (
            <div className="wf-print-relief-grid">
              {days.map((day) => {
                const p = month.days.find(
                  (d) => d.date === workforceDate(month.year, month.month, day),
                )?.payload;
                return (
                  <article key={day}>
                    <h2>
                      {new Date(
                        month.year,
                        month.month - 1,
                        day,
                      ).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </h2>
                    <ol>
                      {p?.entries
                        .filter((e) => e.kind === "crna" && e.status !== "off")
                        .map((e, i) => (
                          <li key={i}>{reliefLabel(e, sites)}</li>
                        ))}
                    </ol>
                    {!p?.entries.some(
                      (e) => e.kind === "crna" && e.status !== "off",
                    ) && <p className="wf-print-blank">Unassigned</p>}
                    <p className="wf-print-off">
                      <b>Off: </b>
                      {p?.entries
                        .filter((e) => e.status === "off")
                        .map((e) => e.name)
                        .join(", ") || "—"}
                    </p>
                    {p?.note && <p>{p.note}</p>}
                  </article>
                );
              })}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  {selected.map((s) => (
                    <th key={s.id}>{workforceSiteName(s)}</th>
                  ))}
                  <th>Off / Notes</th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) => {
                  const row = month.days.find(
                      (d) =>
                        d.date === workforceDate(month.year, month.month, day),
                    ),
                    p = row?.payload;
                  return (
                    <tr key={day}>
                      <th>
                        {day}
                        <small>
                          {new Date(
                            month.year,
                            month.month - 1,
                            day,
                          ).toLocaleDateString("en-US", { weekday: "short" })}
                        </small>
                        <small>
                          {p?.reviewed && !row?.warnings.length
                            ? "Reviewed"
                            : row
                              ? "Saved draft"
                              : "Blank"}
                        </small>
                      </th>
                      {selected.map((s) => {
                        const entries =
                            p?.entries.filter(
                              (e) => e.site_id === s.id && e.status !== "off",
                            ) || [],
                          override = p?.sites[s.id];
                        return (
                          <td key={s.id}>
                            {override?.closed ? (
                              <strong>Closed</strong>
                            ) : (
                              <>
                                <b>MD</b>
                                <p>
                                  {entries
                                    .filter((e) => e.kind === "md")
                                    .map(
                                      (e) =>
                                        `${e.name}${e.status === "admin" ? " (Admin)" : ""}${e.note ? ` · ${e.note}` : ""}`,
                                    )
                                    .join(", ") || "—"}
                                </p>
                                <b>CRNA</b>
                                <p>
                                  {entries
                                    .filter((e) => e.kind === "crna")
                                    .map(
                                      (e) =>
                                        `${e.name}${e.status === "admin" ? " (Admin)" : ""}${e.note ? ` · ${e.note}` : ""}`,
                                    )
                                    .join(", ") || "—"}
                                </p>
                              </>
                            )}
                            <small>
                              {override?.md ?? s.staffing_requirements?.md ?? 0}{" "}
                              MD /{" "}
                              {override?.crna ??
                                s.staffing_requirements?.crna ??
                                0}{" "}
                              CRNA needed
                            </small>
                            {override?.note && <p>{override.note}</p>}
                          </td>
                        );
                      })}
                      <td className="wf-print-off">
                        {p?.entries
                          .filter((e) => e.status === "off")
                          .map(
                            (e) => `${e.name}${e.note ? ` · ${e.note}` : ""}`,
                          )
                          .join(", ") || "—"}
                        {p?.note && <p>{p.note}</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <footer>
            a3isolution.com · Private saved copy · Page {page + 1}/
            {chunks.length}
          </footer>
        </section>
      ))}
    </div>,
    document.body,
  );
}
