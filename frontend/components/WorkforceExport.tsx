"use client";
import { useEffect, useState, useRef } from "react";
import type { ReactNode, ReactPortal } from "react";
const { createPortal } = require("react-dom") as {
  createPortal: (children: ReactNode, container: Element) => ReactPortal;
};
import { getRole, getToken } from "../lib/auth";
import type { Facility } from "../lib/types";
import {
  workforceCopy,
  workforceDate,
  workforceRequest,
  type WorkforceMonth,
  type WorkforceAudience,
  type WorkforceIssue,
} from "../lib/workforce";
import {
  reliefLabel,
  workforceSiteName,
  workforceWorkbook,
} from "../lib/workforceWorkbook";
import { isDriscoll, postedMdName } from "../lib/printBranding";
export default function WorkforceExport({
  month,
  sites,
  onClose,
  initialSection,
}: {
  month: WorkforceMonth;
  sites: Facility[];
  onClose: () => void;
  initialSection?: string;
}) {
  const [ready, setReady] = useState(false),
    [section, setSection] = useState(initialSection || String(sites[0]?.id)),
    [audience, setAudience] = useState<WorkforceAudience>(
      initialSection === "relief" ? "office" : "hospital",
    ),
    [notes, setNotes] = useState(false),
    [issues, setIssues] = useState<WorkforceIssue[]>([]),
    [issue, setIssue] = useState<WorkforceIssue | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const overlay = useRef<HTMLDivElement>(null);
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
  useEffect(() => {
    if (!ready) return;
    const prior = document.activeElement as HTMLElement | null,
      root = overlay.current;
    if (!root) return;
    const els = () =>
      Array.from(
        root.querySelectorAll<HTMLElement>(
          'button,select,input,[tabindex="0"]',
        ),
      ).filter((e) => !(e as HTMLButtonElement).disabled);
    els()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const a = els(),
        first = a[0],
        last = a[a.length - 1];
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
      prior?.focus();
    };
  }, [ready]);
  useEffect(() => {
    if (getRole() !== "admin") return;
    let active = true;
    workforceRequest<WorkforceIssue[]>(
      `issues?year=${month.year}&month=${month.month}`,
      getToken(),
    )
      .then((rows) => {
        if (active) setIssues(rows);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [month.year, month.month]);
  const copy =
      issue?.snapshot || workforceCopy(month, sites, section, audience, notes),
    safe = copy.month,
    safeSites = copy.sites;
  const count = new Date(safe.year, safe.month, 0).getDate(),
    offset = new Date(safe.year, safe.month - 1, 1).getDay();
  const cells = [
    ...Array.from({ length: offset }, () => 0),
    ...Array.from({ length: count }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(0);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) =>
    cells.slice(i * 7, i * 7 + 7),
  );
  const relief = section === "relief",
    site = safeSites[0],
    title = relief
      ? "Rio CRNA order of relief"
      : `${workforceSiteName(site)} workforce`;
  const weekendStaffed = safe.days.some(
    (d) =>
      [0, 6].includes(new Date(d.date + "T12:00:00").getDay()) &&
      (d.payload.entries.some(
        (e) => e.status !== "off" || audience === "office",
      ) ||
        !!d.payload.note ||
        Object.values(d.payload.sites).some((s) => !!s.note)),
  );
  const driscoll = !relief && !!site && isDriscoll(site.site_name);
  const mdName = (name: string) => (driscoll ? postedMdName(name) : name);
  const maxColumnLines = Math.max(
    0,
    ...safe.days.flatMap((d) =>
      ["md", "crna"].map((kind) =>
        d.payload.entries
          .filter((e) => e.kind === kind && e.status !== "off")
          .reduce(
            (n, e) =>
              n +
              Math.ceil((kind === "md" ? mdName(e.name) : e.name).length / 16),
            0,
          ),
      ),
    ),
  );
  const compactDriscoll =
    driscoll &&
    !weekendStaffed &&
    maxColumnLines <= (weeks.length === 6 ? 4 : 6) &&
    safe.days.every((d) => {
      const p = d.payload;
      if (
        p.note ||
        p.sites[site.id]?.note ||
        p.entries.some((e) => e.note || e.status === "off")
      )
        return false;
      return true;
    });
  const updated = safe.days
    .map((d) => d.updated_at)
    .filter(Boolean)
    .sort()
    .at(-1);
  const perPage = compactDriscoll
    ? weeks.length
    : driscoll
      ? maxColumnLines > 12
        ? 1
        : 2
      : relief
        ? weekendStaffed
          ? 1
          : 2
        : workforceSiteName(site) === "ASC"
          ? weekendStaffed
            ? 3
            : weeks.length
          : weekendStaffed
            ? 2
            : 3;
  const pages = Array.from(
    { length: Math.ceil(weeks.length / perPage) },
    (_, i) => weeks.slice(i * perPage, i * perPage + perPage),
  );
  const label = new Date(safe.year, safe.month - 1, 1).toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric" },
  );
  const revision = issue
    ? `Issued copy · Revision ${issue.revision} · ${new Date(issue.created_at).toLocaleDateString()}`
    : "Preview · Saved draft";
  const audienceLabel =
    audience === "office"
      ? "Private office copy"
      : audience === "provider"
        ? "Provider copy"
        : "Hospital copy";
  function reset() {
    setIssue(null);
    setError("");
  }
  function download() {
    getToken();
    const bytes = workforceWorkbook(safe, safeSites, {
        section,
        audience,
        revision,
      }),
      url = URL.createObjectURL(
        new Blob([bytes as BlobPart], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
    const a = document.createElement("a");
    a.href = url;
    a.download = `A3i-${relief ? "rio-relief" : workforceSiteName(site).toLowerCase()}-${safe.year}-${String(safe.month).padStart(2, "0")}-${audience}${issue ? `-rev${issue.revision}` : "-draft"}.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function issueCopy() {
    setBusy(true);
    setError("");
    try {
      const row = await workforceRequest<WorkforceIssue>(
        `issues/${month.year}/${month.month}`,
        getToken(),
        {
          expected_revision: month.revision,
          section,
          audience,
          include_notes: notes,
        },
      );
      setIssue(row);
      setIssues((rows) => [row, ...rows]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
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
          Calendar
          <select
            value={section}
            disabled={busy}
            onChange={(e) => {
              setSection(e.target.value);
              if (e.target.value === "relief" && audience === "hospital")
                setAudience("office");
              reset();
            }}
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {workforceSiteName(s)} workforce
              </option>
            ))}
            <option value="relief">Rio CRNA relief</option>
          </select>
        </label>
        <label>
          For
          <select
            value={audience}
            disabled={busy}
            onChange={(e) => {
              setAudience(e.target.value as WorkforceAudience);
              setNotes(false);
              reset();
            }}
          >
            {!relief && (
              <option value="hospital">
                Hospital copy · No Off names
              </option>
            )}
            <option value="provider">Provider copy · No Off names</option>
            <option value="office">Private office copy · Includes Off</option>
          </select>
        </label>
        {audience !== "office" && (
          <label>
            <input
              type="checkbox"
              checked={notes}
              disabled={busy || !!issue}
              onChange={(e) => {
                setNotes(e.target.checked);
                reset();
              }}
            />
            Include staffing notes shown below
          </label>
        )}
        <button
          onClick={() => {
            getToken();
            window.print();
          }}
        >
          Print / Save PDF
        </button>
        <button onClick={download}>Download Excel · This calendar</button>
        {getRole() === "admin" && (
          <button disabled={busy || !!issue} onClick={() => void issueCopy()}>
            {busy ? "Saving copy…" : "Save issued copy"}
          </button>
        )}
        <button onClick={onClose}>Close</button>
        <label>
          Saved copies
          <select
            aria-label="Saved issued copies"
            value={issue?.id || ""}
            disabled={busy}
            onChange={(e) => {
              setIssue(
                issues.find((r) => r.id === Number(e.target.value)) || null,
              );
              setError("");
            }}
          >
            <option value="">Current saved draft</option>
            {issues
              .filter((r) => r.section === section && r.audience === audience)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  Revision {r.revision} ·{" "}
                  {new Date(r.created_at).toLocaleString()}
                </option>
              ))}
          </select>
        </label>
        <p>
          {audienceLabel}.{" "}
          {issue
            ? "This stored copy stays unchanged when you edit the draft."
            : "Review this preview before saving an issued copy. Partial days remain blank."}{" "}
        </p>
        {error && (
          <p role="alert" className="wf-error">
            {error}
          </p>
        )}
      </div>
      {pages.map((page, pi) => (
        <section
          className={`wf-print-sheet wf-calendar-sheet ${relief ? "is-relief" : ""} ${driscoll ? "driscoll-print" : ""} ${compactDriscoll ? "driscoll-full-month" : ""}`}
          key={pi}
        >
          <header>
            {driscoll && (
              <img
                className="hospital-print-logo"
                src="/logos/driscoll-sun.png"
                alt="Driscoll"
              />
            )}
            <div>
              <p>
                {driscoll
                  ? "Driscoll · Anesthesia Workforce Schedule"
                  : `A3i · ${title}`}
              </p>
              <h1>{label}</h1>
            </div>
            <span>
              {revision}
              {audience === "office" && <><br />{audienceLabel}</>}
              {driscoll && (
                <>
                  <br />
                  {updated
                    ? `Updated ${new Date(updated).toLocaleDateString("en-US")}`
                    : "No saved assignments"}
                </>
              )}
            </span>
            {driscoll && (
              <img
                className="hospital-print-logo hospital-print-logo-right"
                src="/logos/driscoll-sun.png"
                alt=""
              />
            )}
          </header>
          <p className="wf-print-meta">
            {relief
              ? "Relief order as entered · Locations written beside each name"
              : "* MD post-call · A separate annotation"}{" "}
            · Page {pi + 1} of {pages.length}
          </p>
          <table className="wf-export-calendar">
            <colgroup>
              {Array.from({ length: 7 }, (_, i) => (
                <col
                  key={i}
                  style={{
                    width: weekendStaffed
                      ? "14.285%"
                      : i === 0 || i === 6
                        ? "5%"
                        : "18%",
                  }}
                />
              ))}
            </colgroup>
            <thead>
              <tr>
                {[
                  "Sun",
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                  "Sat",
                ].map((d) => (
                  <th key={d}>{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {page.map((week, wi) => (
                <tr key={wi}>
                  {week.map((d, di) => {
                    const p = safe.days.find(
                        (r) =>
                          r.date === workforceDate(safe.year, safe.month, d),
                      )?.payload,
                      entries = p?.entries || [],
                      mds = entries.filter(
                        (e) =>
                          e.kind === "md" &&
                          e.status !== "off" &&
                          e.status !== "post_call",
                      ),
                      crnas = entries.filter(
                        (e) => e.kind === "crna" && e.status !== "off",
                      ),
                      post = entries.filter((e) => e.status === "post_call"),
                      off = entries.filter((e) => e.status === "off");
                    return (
                      <td
                        key={di}
                        className={`${!d ? "empty" : ""} ${di === 0 || di === 6 ? "weekend" : ""}`}
                      >
                        {!!d && (
                          <>
                            <strong className="wf-export-date">{d}</strong>
                            {relief ? (
                              <ol>
                                {crnas.map((e, i) => (
                                  <li key={i}>{reliefLabel(e, safeSites)}</li>
                                ))}
                              </ol>
                            ) : p?.sites[site.id]?.closed ? (
                              <p>Closed</p>
                            ) : mds.length || crnas.length || post.length ? (
                              <div
                                className={`wf-export-pair ${(!mds.length && !post.length) || !crnas.length ? "is-single" : ""}`}
                              >
                                <div hidden={!mds.length && !post.length}>
                                  <b>MD</b>
                                  {mds.map((e, i) => (
                                    <p key={i}>
                                      {post.some(
                                        (v) =>
                                          (v.key && v.key === e.key) ||
                                          v.name === e.name,
                                      )
                                        ? "*"
                                        : ""}
                                      {mdName(e.name)}
                                      {e.note && <small>{e.note}</small>}
                                      {e.status === "admin" && (
                                        <small>Admin</small>
                                      )}
                                    </p>
                                  ))}
                                  {post
                                    .filter(
                                      (e) =>
                                        !mds.some((m) => m.name === e.name),
                                    )
                                    .map((e, i) => (
                                      <p className="wf-post-call" key={`p${i}`}>
                                        *{mdName(e.name)}
                                      </p>
                                    ))}
                                </div>
                                <div hidden={!crnas.length}>
                                  <b>CRNA</b>
                                  {crnas.map((e, i) => (
                                    <p key={i}>
                                      {e.name}
                                      {e.note && <small>{e.note}</small>}
                                      {e.status === "admin" && (
                                        <small>Admin</small>
                                      )}
                                    </p>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            {audience === "office" && off.length > 0 && (
                              <p className="wf-print-off">
                                <b>Off</b> {off.map((e) => e.name).join(", ")}
                              </p>
                            )}
                            {p?.note && (
                              <p className="wf-export-note">{p.note}</p>
                            )}
                            {!relief && p?.sites[site.id]?.note && (
                              <p className="wf-export-note">
                                {p.sites[site.id].note}
                              </p>
                            )}
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <footer>
            {revision}{audience === "office" ? ` · ${audienceLabel}` : ""} · a3isolution.com
          </footer>
        </section>
      ))}
    </div>,
    document.body,
  );
}
