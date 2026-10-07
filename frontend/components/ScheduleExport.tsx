"use client";
import { useState } from "react";
import type { ReactNode, ReactPortal } from "react";
const { createPortal } = require("react-dom") as {
  createPortal: (children: ReactNode, container: Element) => ReactPortal;
};
import type { ScheduleEntry } from "../lib/types";
import { getToken } from "../lib/auth";
import { scheduleWorkbook } from "../lib/scheduleWorkbook";
import { isDriscoll, postedMdName, rioCallContacts } from "../lib/printBranding";

type Props = {
  offForDate?: (date: string) => string[];
  year: number;
  month: number;
  facility: string;
  schedules: ScheduleEntry[];
  disabled: boolean;
  template?: boolean;
  staffing?: string;
};
export default function ScheduleExport({
  offForDate = () => [],
  year,
  month,
  facility,
  schedules,
  disabled,
  template = false,
  staffing,
}: Props) {
  const [open, setOpen] = useState(false),
    [audience, setAudience] = useState("hospital");
  const driscoll = isDriscoll(facility),
    contacts = rioCallContacts(facility);
  const label = new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const facilitySlug = facility
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const days = Array.from(
    { length: new Date(year, month, 0).getDate() },
    (_, i) => {
      const date = `${prefix}-${String(i + 1).padStart(2, "0")}`;
      const row = schedules.find(
        (s) => s.date === date && s.facility === facility,
      );
      return {
        date,
        day: i + 1,
        off: audience === "office" ? offForDate(date) : [],
        first: row?.callFirstName ? (driscoll ? postedMdName(row.callFirstName) : row.callFirstName) : "Unassigned",
        second: row?.callSecondName ? (driscoll ? postedMdName(row.callSecondName) : row.callSecondName) : "Unassigned",
      };
    },
  );
  const missing = days.filter(
    (d) => d.first === "Unassigned" || d.second === "Unassigned",
  ).length;
  const leading = new Date(year, month - 1, 1).getDay();
  const cells = [...Array.from({ length: leading }, () => null), ...days];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) =>
    cells.slice(i * 7, i * 7 + 7),
  );
  function spreadsheet() {
    getToken();
    const bytes = scheduleWorkbook(year, month, facility, days, {
      template,
      staffing,
      audience,
    });
    const url = URL.createObjectURL(
      new Blob([bytes as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `A3i-${facilitySlug}-${prefix}${template ? "-blank" : ""}.xlsx`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-4">
        <label className="text-sm self-center">
          Copy for{" "}
          <select
            aria-label="Call schedule audience"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
          >
            <option value="hospital">Hospital · No Off names</option>
            <option value="provider">Providers · No Off names</option>
            <option value="office">Dad & office staff · Includes Off</option>
          </select>
        </label>
        <button
          className="secondary-button"
          disabled={disabled}
          onClick={() => {
            getToken();
            setOpen(true);
          }}
        >
          Print / Save PDF
        </button>
        <button
          className="secondary-button"
          disabled={disabled}
          onClick={spreadsheet}
        >
          Download Excel calendar
        </button>
        <span className="text-sm text-slate-600 self-center">
          {template
            ? "Download a blank calendar. No assignments will be created."
            : "Exports use saved assignments. Save your edits first."}
        </span>
      </div>
      {open &&
        createPortal(
          <div
            className="schedule-export-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Monthly schedule print preview"
          >
            <div className="schedule-export-actions">
              <button
                className="primary-button"
                onClick={() => {
                  getToken();
                  const title = document.title;
                  document.title = `A3i — ${facility} — ${label}${template ? " — Blank calendar" : ""}`;
                  window.print();
                  document.title = title;
                }}
              >
                Print or save as PDF
              </button>
              <button
                className="secondary-button"
                autoFocus
                onClick={() => setOpen(false)}
              >
                Close preview
              </button>
              <p>
                Use Landscape, enable background graphics, and turn off browser
                headers and footers.
              </p>
            </div>
            <article
              className={`schedule-export-sheet weeks-${weeks.length} ${driscoll ? "driscoll-print" : ""}`}
            >
              <header>
                <div className="export-heading">
                  <span
                    className={driscoll ? "hospital-print-logo" : "export-logo"}
                  >
                    <img
                      src={
                        driscoll
                          ? "/logos/driscoll-sun.png"
                          : "/logos/a3i-navy.png"
                      }
                      alt={driscoll ? "Driscoll" : "A3i"}
                    />
                  </span>
                  <div>
                    <p>{facility}</p>
                    <h1>{label}</h1>
                    <h2>
                      {template || driscoll
                        ? "Anesthesia On-Call Schedule"
                        : "First & second call schedule"}
                    </h2>
                  </div>
                </div>
                <div className="export-meta">
                  <strong>
                    {template
                      ? "Blank template · No assignments"
                      : missing
                        ? `Draft · ${missing} unfinished ${missing === 1 ? "day" : "days"}`
                        : "All days assigned · Saved copy"}
                  </strong>
                  <p>
                    {audience === "office"
                      ? "Private · Dad & office staff"
                      : audience === "hospital"
                        ? "Hospital posting · Off excluded"
                        : "Provider copy · Off excluded"}
                  </p>
                  <p>Exported {new Date().toLocaleDateString()}</p>
                  {staffing && <p>Daily staffing target: {staffing}</p>}
                </div>
                {driscoll && (
                  <img
                    className="hospital-print-logo hospital-print-logo-right"
                    src="/logos/driscoll-sun.png"
                    alt=""
                  />
                )}
              </header>
              <div className="export-legend">
                {template ? (
                  "Two call entries per day · Blank planning template"
                ) : (
                  <>
                    <span className="export-first-key">
                      1st · First call{contacts ? ` · ${contacts.first}` : ""}
                    </span>
                    <span>
                      2nd · Second call{contacts ? ` · ${contacts.second}` : ""}
                    </span>
                    {audience === "office" && (
                      <span className="export-off-key">
                        Off · Private office copy
                      </span>
                    )}
                  </>
                )}
              </div>
              <table>
                <thead>
                  <tr>
                    {[
                      "Sunday",
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                    ].map((d) => (
                      <th scope="col" key={d}>
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((week, i) => (
                    <tr key={i}>
                      {week.map((day, j) => (
                        <td
                          key={j}
                          className={`${day ? "" : "empty"} ${j === 0 || j === 6 ? "export-weekend" : ""}`}
                        >
                          {day && (
                            <>
                              <b className="export-date">{day.day}</b>
                              {template ? (
                                <>
                                  <p className="export-template-line">
                                    <small>Call 1</small>
                                    <span />
                                  </p>
                                  <p className="export-template-line">
                                    <small>Call 2</small>
                                    <span />
                                  </p>
                                  {audience === "office" && (
                                    <p className="export-template-line">
                                      <small>Off</small>
                                      <span />
                                    </p>
                                  )}
                                </>
                              ) : (
                                <>
                                  <p
                                    className={`export-call export-first ${day.first === "Unassigned" ? "export-unassigned" : ""}`}
                                  >
                                    <small>1st</small>
                                    <span>
                                      {day.first === "Unassigned"
                                        ? "—"
                                        : day.first}
                                    </span>
                                  </p>
                                  <p
                                    className={`export-call ${day.second === "Unassigned" ? "export-unassigned" : ""}`}
                                  >
                                    <small>2nd</small>
                                    <span>
                                      {day.second === "Unassigned"
                                        ? "—"
                                        : day.second}
                                    </span>
                                  </p>
                                  {day.off.length > 0 && (
                                    <div className="export-off">
                                      {day.off.map((name) => (
                                        <p key={name}>
                                          <small>Off</small>
                                          <span>{name}</span>
                                        </p>
                                      ))}
                                    </div>
                                  )}
                                </>
                              )}
                            </>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <footer>
                <span>
                  {template
                    ? "Blank template for planning. Daily staffing targets do not define overnight call coverage."
                    : "Saved schedule snapshot. Partial days stay blank; check A3i for later changes."}
                </span>
                <strong>a3isolution.com</strong>
              </footer>
            </article>
          </div>,
          document.body,
        )}
    </>
  );
}
