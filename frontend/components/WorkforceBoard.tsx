"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchFacilities } from "../lib/api";
import { getRole, getToken } from "../lib/auth";
import type { Facility } from "../lib/types";
import {
  emptyWorkforceDay,
  normalizeWorkforceDay,
  workforceDate,
  workforceRequest,
  type RosterMember,
  type WorkforceDay,
  type WorkforceEntry,
  type WorkforceHistory,
  type WorkforceMonth,
  type WorkforcePayload,
  type WorkforceSettings,
  type WorkforceSiteDay,
} from "../lib/workforce";
import WorkforceExport from "./WorkforceExport";
const shortSite = (s: Facility) =>
  /driscoll/i.test(s.site_name)
    ? "Driscoll"
    : /utrgv/i.test(s.site_name)
      ? "UTRGV"
      : /asc|regional surgical/i.test(s.site_name)
        ? "ASC"
        : "Rio";
const blankSite = (): WorkforceSiteDay => ({
  closed: false,
  md: null,
  crna: null,
  note: "",
});
export default function WorkforceBoard({
  accountKey,
}: {
  accountKey?: string;
}) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear()),
    [month, setMonth] = useState(today.getMonth() + 1),
    [day, setDay] = useState(1);
  const [sites, setSites] = useState<Facility[]>([]),
    [settings, setSettings] = useState<WorkforceSettings | null>(null),
    [monthData, setMonthData] = useState<WorkforceMonth | null>(null);
  const [draft, setDraft] = useState<WorkforcePayload>(emptyWorkforceDay),
    [baseline, setBaseline] = useState<WorkforcePayload>(emptyWorkforceDay),
    [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [history, setHistory] = useState<WorkforceHistory[] | null>(null),
    [rosterOpen, setRosterOpen] = useState(false),
    [rosterDraft, setRosterDraft] = useState<WorkforceSettings | null>(null),
    [rosterSite, setRosterSite] = useState(""),
    [newName, setNewName] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const rosterDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (rosterOpen) rosterDialog.current?.showModal();
  }, [rosterOpen]);
  const requestId = useRef(0),
    dirty = JSON.stringify(draft) !== JSON.stringify(baseline),
    canEdit = getRole() === "admin";
  const date = workforceDate(year, month, day),
    daysInMonth = new Date(year, month, 0).getDate(),
    monthLabel = new Date(year, month - 1, 1).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  const allMds = useMemo(
    () =>
      Array.from(
        new Map(
          Object.values(settings?.rosters || {})
            .flat()
            .map((m) => [m.key, m]),
        ).values(),
      ),
    [settings],
  );
  const keyPrefix = `a3i-workforce-${accountKey || "account"}`;
  function showDay(d: number, data: WorkforceMonth) {
    const row = data.days.find(
      (r) => r.date === workforceDate(data.year, data.month, d),
    );
    const p = normalizeWorkforceDay(row?.payload);
    setDay(d);
    setDraft(p);
    setBaseline(p);
    setRevision(row?.revision || 0);
    setHistory(null);
    setNotice("");
    setError("");
  }
  async function load(y = year, m = month, preferred = day) {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const [f, s, data] = await Promise.all([
        fetchFacilities(getToken()),
        workforceRequest<WorkforceSettings>("settings", getToken()),
        workforceRequest<WorkforceMonth>(
          `month?year=${y}&month=${m}`,
          getToken(),
        ),
      ]);
      if (id !== requestId.current) return;
      setSites(f);
      setSettings(s);
      setMonthData(data);
      setYear(y);
      setMonth(m);
      showDay(Math.min(preferred, new Date(y, m, 0).getDate()), data);
    } catch (e) {
      if (id === requestId.current) setError((e as Error).message);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }
  // A saved bookmark restores the exact day, independent of the call calendar.
  useEffect(() => {
    let saved: number[] = [];
    try {
      saved = JSON.parse(localStorage.getItem(keyPrefix) || "[]");
    } catch {}
    void load(
      saved[0] || today.getFullYear(),
      saved[1] || today.getMonth() + 1,
      saved[2] || 1,
    );
    const accountRequestId = requestId;
    return () => {
      accountRequestId.current++;
    };
  }, [accountKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (loading) return;
    localStorage.setItem(keyPrefix, JSON.stringify([year, month, day]));
  }, [keyPrefix, year, month, day, loading]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  function changePayload(p: WorkforcePayload) {
    setDraft({ ...p, reviewed: false });
    setNotice("");
    setHistory(null);
  }
  function editEntry(index: number, patch: Partial<WorkforceEntry>) {
    changePayload({
      ...draft,
      entries: draft.entries.map((e, i) =>
        i === index ? { ...e, ...patch } : e,
      ),
    });
  }
  function members(e: WorkforceEntry) {
    return e.kind === "crna"
      ? settings?.crnas || []
      : e.status === "working"
        ? settings?.rosters[String(e.site_id)] || []
        : allMds;
  }
  function add(
    kind: "md" | "crna",
    site: Facility | null,
    status: "working" | "off" = "working",
  ) {
    changePayload({
      ...draft,
      entries: [
        ...draft.entries,
        {
          kind,
          key: null,
          name: "",
          guest: false,
          site_id: site?.id || null,
          home_site_id: site?.id || null,
          status,
          note: "",
        },
      ],
    });
  }
  function move(index: number, step: number) {
    const indexes = draft.entries
        .map((e, i) => (e.kind === "crna" && e.status !== "off" ? i : -1))
        .filter((i) => i >= 0),
      position = indexes.indexOf(index),
      other = indexes[position + step];
    if (other === undefined) return;
    const entries = [...draft.entries];
    [entries[index], entries[other]] = [entries[other], entries[index]];
    changePayload({ ...draft, entries });
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const result = await workforceRequest<WorkforceDay>(
        `day/${date}`,
        getToken(),
        {
          expected_revision: revision,
          payload: {
            ...draft,
            entries: draft.entries.filter((e) =>
              e.guest ? e.name.trim() : e.key,
            ),
          },
        },
      );
      setRevision(result.revision);
      setDraft(result.payload);
      setBaseline(result.payload);
      setMonthData((data) =>
        data
          ? {
              ...data,
              status: "draft",
              revision: result.month_revision || data.revision,
              days: [...data.days.filter((d) => d.date !== date), result].sort(
                (a, b) => a.date.localeCompare(b.date),
              ),
            }
          : data,
      );
      setNotice("Saved. You can continue this day anytime.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function markReady() {
    if (!monthData) return;
    setBusy(true);
    setError("");
    try {
      const result = await workforceRequest<WorkforceMonth>(
        `month/${year}/${month}/status`,
        getToken(),
        {
          expected_revision: monthData.revision,
          status: monthData.status === "ready" ? "draft" : "ready",
        },
      );
      setMonthData(result);
      setNotice(
        result.status === "ready"
          ? "Ready to share. Your workspace remains private."
          : "Returned to draft.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function editSite(site: Facility, patch: Partial<WorkforceSiteDay>) {
    changePayload({
      ...draft,
      sites: {
        ...draft.sites,
        [site.id]: { ...blankSite(), ...draft.sites[site.id], ...patch },
      },
    });
  }
  async function getHistory() {
    setError("");
    try {
      setHistory(
        await workforceRequest<WorkforceHistory[]>(
          `day/${date}/history`,
          getToken(),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function openRoster() {
    if (!settings) return;
    setRosterDraft(structuredClone(settings));
    setRosterSite(
      String(
        sites.find((s) => /driscoll/i.test(s.site_name))?.id ||
          sites[0]?.id ||
          "",
      ),
    );
    setRosterOpen(true);
    setNewName("");
  }
  async function saveRoster() {
    if (!rosterDraft || !settings) return;
    setBusy(true);
    setError("");
    try {
      const saved = await workforceRequest<WorkforceSettings>(
        "settings",
        getToken(),
        {
          expected_revision: settings.revision,
          rosters: rosterDraft.rosters,
          crnas: rosterDraft.crnas,
        },
      );
      setSettings(saved);
      setRosterOpen(false);
      await load(year, month, day);
      setNotice("Roster saved. Existing call schedules are unchanged.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const selectedSaved = monthData?.days.find((d) => d.date === date),
    reviewedCount =
      monthData?.days.filter((d) => d.payload.reviewed && !d.warnings.length)
        .length || 0;
  const relief = draft.entries
    .map((e, index) => ({ e, index }))
    .filter(({ e }) => e.kind === "crna" && e.status !== "off");
  function entryRow(e: WorkforceEntry, index: number, rank?: number) {
    const source = members(e);
    return (
      <div
        className={`wf-person-row ${e.status === "off" ? "wf-off-row" : ""}`}
        key={index}
      >
        {rank !== undefined && (
          <div className="wf-relief-rank">
            <strong>{rank + 1}</strong>
            <div>
              <button
                aria-label={`Move ${e.name || "CRNA"} earlier in relief order`}
                onClick={() => move(index, -1)}
                disabled={!canEdit || busy || rank === 0}
              >
                ↑
              </button>
              <button
                aria-label={`Move ${e.name || "CRNA"} later in relief order`}
                onClick={() => move(index, 1)}
                disabled={!canEdit || busy || rank === relief.length - 1}
              >
                ↓
              </button>
            </div>
          </div>
        )}
        <label className="wf-person">
          <span>
            {e.kind === "md" ? "MD" : "CRNA"}
            {e.guest ? " · Temporary" : ""}
          </span>
          {e.guest ? (
            <input
              aria-label="Temporary clinician name"
              value={e.name}
              maxLength={100}
              onChange={(ev) => editEntry(index, { name: ev.target.value })}
            />
          ) : (
            <select
              aria-label={`${e.kind.toUpperCase()} ${e.status === "off" ? "off" : "assignment"} name`}
              value={e.key || ""}
              onChange={(ev) => {
                if (ev.target.value === "guest") {
                  editEntry(index, { guest: true, key: null, name: "" });
                  return;
                }
                const m = source.find((m) => m.key === ev.target.value);
                editEntry(index, { key: m?.key || null, name: m?.name || "" });
              }}
            >
              <option value="">Choose a name</option>
              {source
                .filter((m) => m.active || m.key === e.key)
                .map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.name}
                    {!m.active ? " (archived)" : ""}
                  </option>
                ))}
              <option value="guest">Type temporary clinician…</option>
            </select>
          )}
        </label>
        {e.status !== "off" && (
          <label>
            <span>Location</span>
            <select
              aria-label={`Location for ${e.name || e.kind}`}
              value={e.site_id || ""}
              onChange={(ev) => {
                const site = Number(ev.target.value);
                const keep =
                  e.kind === "crna" ||
                  settings?.rosters[String(site)]?.some(
                    (m) => m.key === e.key,
                  ) ||
                  e.guest;
                editEntry(index, {
                  site_id: site,
                  ...(!keep ? { key: null, name: "" } : {}),
                });
              }}
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {shortSite(s)}
                </option>
              ))}
            </select>
          </label>
        )}
        {e.status !== "off" && (
          <label>
            <span>Duty</span>
            <select
              value={e.status}
              aria-label={`Duty for ${e.name || e.kind}`}
              onChange={(ev) =>
                editEntry(index, {
                  status: ev.target.value as WorkforceEntry["status"],
                })
              }
            >
              <option value="working">Clinical</option>
              <option value="admin">Admin</option>
            </select>
          </label>
        )}
        <label className="wf-timing">
          <span>
            {e.kind === "crna" && e.status !== "off"
              ? "Timing / transfer note"
              : "Note (optional)"}
          </span>
          <input
            value={e.note}
            maxLength={250}
            placeholder={
              e.kind === "crna" && e.status !== "off"
                ? "e.g. 11am, 7–3, Out by 3:30pm"
                : ""
            }
            onChange={(ev) => editEntry(index, { note: ev.target.value })}
          />
        </label>
        <button
          className="wf-remove"
          aria-label={`Remove ${e.name || "assignment"}`}
          onClick={() =>
            changePayload({
              ...draft,
              entries: draft.entries.filter((_, i) => i !== index),
            })
          }
        >
          ×
        </button>
        {e.guest && (
          <button
            className="wf-roster-link"
            onClick={() =>
              editEntry(index, { guest: false, key: null, name: "" })
            }
          >
            Choose from roster
          </button>
        )}
        {e.kind === "crna" &&
          e.site_id !== e.home_site_id &&
          e.home_site_id && (
            <small className="wf-transfer">
              Transferred from{" "}
              {shortSite(
                sites.find((s) => s.id === e.home_site_id) || sites[0],
              )}
            </small>
          )}
      </div>
    );
  }
  return (
    <section className="wf-board" aria-label="Daily workforce">
      <header className="wf-header">
        <div>
          <p className="eyebrow">Daily workforce</p>
          <h1>Every site. One clear plan.</h1>
          <p>Build the day, arrange CRNA relief, and save as you go.</p>
        </div>
        <div className="wf-toolbar">
          <button
            onClick={openRoster}
            disabled={loading || busy || dirty || !canEdit}
          >
            Manage rosters
          </button>
          <button
            onClick={() => setExportOpen(true)}
            disabled={loading || busy || dirty || !monthData}
          >
            Print / Save
          </button>
        </div>
      </header>
      <div className="wf-monthbar">
        <button
          aria-label="Previous workforce month"
          disabled={dirty || busy || loading || (year === 2000 && month === 1)}
          onClick={() => {
            const d = new Date(year, month - 2, 1);
            void load(d.getFullYear(), d.getMonth() + 1, 1);
          }}
        >
          ←
        </button>
        <h2>{monthLabel}</h2>
        <button
          aria-label="Next workforce month"
          disabled={dirty || busy || loading || (year === 2100 && month === 12)}
          onClick={() => {
            const d = new Date(year, month, 1);
            void load(d.getFullYear(), d.getMonth() + 1, 1);
          }}
        >
          →
        </button>
        <span
          className={`wf-badge ${monthData?.status === "ready" ? "is-ready" : ""}`}
        >
          {monthData?.status === "ready" ? "Ready to share" : "Draft · Private"}
        </span>
        <span>
          {reviewedCount}/{daysInMonth} days reviewed
        </span>
        <button
          disabled={dirty || busy || loading || !canEdit}
          onClick={markReady}
        >
          {monthData?.status === "ready"
            ? "Return to draft"
            : "Mark month ready"}
        </button>
      </div>
      <p className="wf-help">
        Save any amount of progress. “Reviewed” records that you checked a day;
        “Ready to share” requires every day reviewed with coverage warnings
        resolved. It does not publish to staff.
      </p>
      {error && (
        <div role="alert" className="wf-error">
          {error}
          {!settings ? (
            <button onClick={() => void load()}>Try again</button>
          ) : (
            <button disabled={busy} onClick={() => void load()}>
              Discard edits & reload saved day
            </button>
          )}
        </div>
      )}
      {notice && (
        <div role="status" className="wf-notice">
          {notice}
        </div>
      )}
      {loading ? (
        <p role="status">Loading your saved workforce…</p>
      ) : (
        settings &&
        monthData && (
          <div className="wf-layout">
            <aside className="wf-calendar">
              <div className="wf-calendar-title">
                <h3>Your month</h3>
                <button
                  disabled={dirty || busy}
                  onClick={() => {
                    const next = Array.from(
                      { length: daysInMonth },
                      (_, i) => i + 1,
                    ).find(
                      (d) =>
                        !monthData.days.find(
                          (r) => r.date === workforceDate(year, month, d),
                        )?.payload.reviewed,
                    );
                    if (next) showDay(next, monthData);
                  }}
                >
                  Next unfinished
                </button>
              </div>
              <div className="wf-date-grid">
                {["S", "M", "T", "W", "T", "F", "S"].map((s, i) => (
                  <span key={i} aria-hidden="true">
                    {s}
                  </span>
                ))}
                {Array.from(
                  { length: new Date(year, month - 1, 1).getDay() },
                  (_, i) => (
                    <span key={`blank-${i}`} />
                  ),
                )}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const n = i + 1,
                    r = monthData.days.find(
                      (d) => d.date === workforceDate(year, month, n),
                    );
                  return (
                    <button
                      key={n}
                      disabled={busy || (dirty && n !== day)}
                      aria-pressed={day === n}
                      aria-label={`${monthLabel} ${n}, ${r?.payload.reviewed && !r.warnings.length ? "reviewed" : r ? "saved draft" : "blank"}`}
                      onClick={() => showDay(n, monthData)}
                      className={
                        r?.payload.reviewed && !r.warnings.length
                          ? "reviewed"
                          : r
                            ? "saved"
                            : ""
                      }
                    >
                      {n}
                      <small>
                        {r?.payload.reviewed && !r.warnings.length
                          ? "✓"
                          : r
                            ? "•"
                            : ""}
                      </small>
                    </button>
                  );
                })}
              </div>
              <p>• Saved draft &nbsp; ✓ Reviewed</p>
              {dirty && (
                <p className="wf-unsaved">
                  Save or discard this day to change dates.
                </p>
              )}
              <p className="wf-help">
                Call calendars are separate. These workforce edits do not
                replace Rio call assignments.
              </p>
            </aside>
            <div className="wf-editor">
              <div className="wf-day-title">
                <div>
                  <p className="eyebrow">Build your day</p>
                  <h2>
                    {new Date(year, month - 1, day).toLocaleDateString(
                      "en-US",
                      { weekday: "long", month: "long", day: "numeric" },
                    )}
                  </h2>
                </div>
                <span>
                  {dirty
                    ? "Unsaved edits"
                    : selectedSaved
                      ? `Saved · v${revision}`
                      : "Blank day"}
                </span>
              </div>
              <div className="wf-jump">
                <label>
                  <span>Jump to a day</span>
                  <input
                    aria-label="Workforce day"
                    type="date"
                    min="2000-01-01"
                    max="2100-12-31"
                    value={date}
                    disabled={dirty || busy}
                    onChange={(e) => {
                      const [y, m, d] = e.target.value.split("-").map(Number);
                      if (!y || !m || !d || y < 2000 || y > 2100) return;
                      if (y === year && m === month) showDay(d, monthData);
                      else void load(y, m, d);
                    }}
                  />
                </label>
                <button
                  aria-label="Previous workforce day"
                  disabled={dirty || busy || day === 1}
                  onClick={() => showDay(day - 1, monthData)}
                >
                  ←
                </button>
                <button
                  aria-label="Next workforce day"
                  disabled={dirty || busy || day === daysInMonth}
                  onClick={() => showDay(day + 1, monthData)}
                >
                  →
                </button>
              </div>
              <fieldset
                disabled={!canEdit || busy || loading}
                className="wf-fieldset"
              >
                <div className="wf-sites">
                  {sites.map((site) => {
                    const override = draft.sites[site.id] || blankSite(),
                      assigned = draft.entries.filter(
                        (e) => e.site_id === site.id && e.status === "working",
                      );
                    return (
                      <section
                        key={site.id}
                        className={`wf-site ${override.closed ? "closed" : ""}`}
                      >
                        <div>
                          <h3>{shortSite(site)}</h3>
                          <label className="wf-check">
                            <input
                              type="checkbox"
                              checked={override.closed}
                              onChange={(ev) =>
                                editSite(site, { closed: ev.target.checked })
                              }
                            />
                            Closed
                          </label>
                        </div>
                        <p>
                          {["md", "crna"]
                            .map(
                              (kind) =>
                                `${assigned.filter((e) => e.kind === kind).length}/${override.closed ? 0 : (override[kind as "md" | "crna"] ?? site.staffing_requirements?.[kind] ?? 0)} ${kind.toUpperCase()}`,
                            )
                            .join(" · ")}
                        </p>
                        <details>
                          <summary>Daily needs & notes</summary>
                          {(["md", "crna"] as const).map((kind) => (
                            <label key={kind}>
                              <span>{kind.toUpperCase()} needed</span>
                              <input
                                aria-label={`${shortSite(site)} ${kind.toUpperCase()} needed`}
                                type="number"
                                min={0}
                                max={100}
                                placeholder={String(
                                  site.staffing_requirements?.[kind] || 0,
                                )}
                                value={override[kind] ?? ""}
                                onChange={(ev) =>
                                  editSite(site, {
                                    [kind]:
                                      ev.target.value === ""
                                        ? null
                                        : Number(ev.target.value),
                                  })
                                }
                              />
                            </label>
                          ))}
                          <label>
                            <span>Exception / holiday</span>
                            <input
                              maxLength={250}
                              value={override.note}
                              onChange={(ev) =>
                                editSite(site, { note: ev.target.value })
                              }
                            />
                          </label>
                        </details>
                        <div className="wf-add-site">
                          <button
                            onClick={() => add("md", site)}
                            disabled={override.closed}
                          >
                            + MD
                          </button>
                          <button
                            onClick={() => add("crna", site)}
                            disabled={override.closed}
                          >
                            + CRNA
                          </button>
                        </div>
                      </section>
                    );
                  })}
                </div>
                <section className="wf-section">
                  <h3>MD assignments</h3>
                  {!draft.entries.some(
                    (e) => e.kind === "md" && e.status !== "off",
                  ) && (
                    <p className="wf-empty">
                      Use + MD at a site above. Driscoll has its own roster.
                    </p>
                  )}
                  {draft.entries.map((e, i) =>
                    e.kind === "md" && e.status !== "off"
                      ? entryRow(e, i)
                      : null,
                  )}
                </section>
                <section className="wf-section">
                  <div className="wf-section-heading">
                    <h3>CRNA order of relief</h3>
                    <span>{relief.length} listed</span>
                  </div>
                  <p className="wf-help">
                    Use arrows to set the order shown on your relief sheet.
                    Timing notes stay exactly as entered.
                  </p>
                  {!relief.length && (
                    <p className="wf-empty">
                      Use + CRNA at a site above, then arrange the list.
                    </p>
                  )}
                  {relief.map(({ e, index }, rank) => entryRow(e, index, rank))}
                  <p className="wf-help">
                    Transfers show their current site. Exports also keep *
                    Driscoll, ** UTRGV, and (ASC).
                  </p>
                </section>
                <section className="wf-section">
                  <div className="wf-section-heading">
                    <h3>Off</h3>
                    <div>
                      <button onClick={() => add("md", null, "off")}>
                        + MD off
                      </button>
                      <button onClick={() => add("crna", null, "off")}>
                        + CRNA off
                      </button>
                    </div>
                  </div>
                  {!draft.entries.some((e) => e.status === "off") && (
                    <p className="wf-empty">
                      Add as many people off as needed for this day.
                    </p>
                  )}
                  {draft.entries.map((e, i) =>
                    e.status === "off" ? entryRow(e, i) : null,
                  )}
                </section>
                <label className="wf-day-notes">
                  <span>Day notes</span>
                  <textarea
                    maxLength={2000}
                    value={draft.note}
                    onChange={(ev) =>
                      changePayload({ ...draft, note: ev.target.value })
                    }
                    placeholder="Holiday, extra room, availability, or something to remember…"
                  />
                </label>
                <label className="wf-check wf-review">
                  <input
                    type="checkbox"
                    checked={draft.reviewed}
                    onChange={(ev) => {
                      setDraft({ ...draft, reviewed: ev.target.checked });
                      setNotice("");
                    }}
                  />
                  I reviewed this day{" "}
                  <span>Any further edits return it to unfinished.</span>
                </label>
              </fieldset>
              {selectedSaved?.warnings.length && !dirty ? (
                <details className="wf-warnings">
                  <summary>
                    {selectedSaved.warnings.length} coverage checks to finish
                    this day
                  </summary>
                  <ul>
                    {selectedSaved.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
              <div className="wf-savebar">
                <button
                  className="wf-primary"
                  disabled={busy || !dirty || !canEdit}
                  onClick={save}
                >
                  {busy ? "Saving…" : "Save day"}
                </button>
                <button
                  disabled={busy || !dirty}
                  onClick={() => {
                    setDraft(structuredClone(baseline));
                    setError("");
                    setNotice("Edits discarded. Your saved day is unchanged.");
                  }}
                >
                  Discard edits
                </button>
                <button
                  disabled={busy || dirty || !revision}
                  onClick={getHistory}
                >
                  Previous versions
                </button>
                {dirty && <span>Save now, finish later.</span>}
              </div>
              {history && (
                <section className="wf-history">
                  <h3>Previous saved versions</h3>
                  <p>
                    Restoring loads a previous version for review. Press Save
                    day to keep it.
                  </p>
                  {history.length ? (
                    history.map((h) => (
                      <button
                        key={h.revision}
                        disabled={busy || dirty || !canEdit}
                        onClick={() => {
                          setDraft(normalizeWorkforceDay(h.payload));
                          setHistory(null);
                          setNotice(
                            "Previous version loaded. Review it, then Save day.",
                          );
                        }}
                      >
                        Load v{h.revision} ·{" "}
                        {new Date(h.created_at).toLocaleString()}
                      </button>
                    ))
                  ) : (
                    <p>No earlier versions.</p>
                  )}
                </section>
              )}
            </div>
          </div>
        )
      )}
      {rosterOpen && rosterDraft && (
        <dialog
          ref={rosterDialog}
          className="wf-modal"
          aria-label="Manage workforce rosters"
          onCancel={(e) => {
            if (busy) e.preventDefault();
            else setRosterOpen(false);
          }}
        >
          <section>
            <div className="wf-section-heading">
              <h2>Workforce rosters</h2>
              <button
                disabled={busy}
                onClick={() => setRosterOpen(false)}
                aria-label="Close rosters"
              >
                ×
              </button>
            </div>
            <p>
              Driscoll MDs stay separate from Rio. Archived people remain on
              saved days. Temporary clinicians belong on the day only.
            </p>
            <label>
              <span>Roster</span>
              <select
                value={rosterSite}
                onChange={(e) => {
                  setRosterSite(e.target.value);
                  setNewName("");
                }}
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {shortSite(s)} MDs
                  </option>
                ))}
                <option value="crnas">Shared CRNA pool</option>
              </select>
            </label>
            <div className="wf-roster-list">
              {(rosterSite === "crnas"
                ? rosterDraft.crnas
                : rosterDraft.rosters[rosterSite] || []
              ).map((m) => (
                <div key={m.key}>
                  <label>
                    <span>{!m.active ? "Archived name" : "Name"}</span>
                    <input
                      aria-label={`Roster name for ${m.name}`}
                      value={m.name}
                      maxLength={100}
                      onChange={(e) => {
                        const name = e.target.value;
                        if (rosterSite === "crnas")
                          setRosterDraft({
                            ...rosterDraft,
                            crnas: rosterDraft.crnas.map((p) =>
                              p.key === m.key ? { ...p, name } : p,
                            ),
                          });
                        else
                          setRosterDraft({
                            ...rosterDraft,
                            rosters: Object.fromEntries(
                              Object.entries(rosterDraft.rosters).map(
                                ([key, list]) => [
                                  key,
                                  list.map((p) =>
                                    p.key === m.key ? { ...p, name } : p,
                                  ),
                                ],
                              ),
                            ),
                          });
                      }}
                    />
                  </label>
                  <button
                    onClick={() => {
                      const update = (list: RosterMember[]) =>
                        list.map((p) =>
                          p.key === m.key ? { ...p, active: !p.active } : p,
                        );
                      setRosterDraft(
                        rosterSite === "crnas"
                          ? { ...rosterDraft, crnas: update(rosterDraft.crnas) }
                          : {
                              ...rosterDraft,
                              rosters: {
                                ...rosterDraft.rosters,
                                [rosterSite]: update(
                                  rosterDraft.rosters[rosterSite] || [],
                                ),
                              },
                            },
                      );
                    }}
                  >
                    {m.active ? "Archive" : "Restore"}
                  </button>
                </div>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const name = newName.trim();
                if (!name) return;
                const list =
                  rosterSite === "crnas"
                    ? rosterDraft.crnas
                    : rosterDraft.rosters[rosterSite] || [];
                if (
                  list.some((m) => m.name.toLowerCase() === name.toLowerCase())
                ) {
                  setError(
                    "That name is already on this roster. Restore it if archived.",
                  );
                  return;
                }
                const existing = allMds.find(
                  (m) => m.name.toLowerCase() === name.toLowerCase(),
                );
                const member = {
                  key:
                    rosterSite === "crnas"
                      ? `crna-custom-${crypto.randomUUID()}`
                      : existing?.key || `md-custom-${crypto.randomUUID()}`,
                  name,
                  active: true,
                };
                setRosterDraft(
                  rosterSite === "crnas"
                    ? { ...rosterDraft, crnas: [...list, member] }
                    : {
                        ...rosterDraft,
                        rosters: {
                          ...rosterDraft.rosters,
                          [rosterSite]: [...list, member],
                        },
                      },
                );
                setNewName("");
              }}
            >
              <label>
                <span>Add a permanent roster member</span>
                <input
                  value={newName}
                  maxLength={100}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </label>
              <button disabled={!newName.trim() || busy}>Add name</button>
            </form>
            {error && (
              <p role="alert" className="wf-error">
                {error}
              </p>
            )}
            <div className="wf-savebar">
              <button
                className="wf-primary"
                disabled={busy}
                onClick={saveRoster}
              >
                {busy ? "Saving…" : "Save roster"}
              </button>
              <button disabled={busy} onClick={() => setRosterOpen(false)}>
                Cancel
              </button>
            </div>
          </section>
        </dialog>
      )}
      {exportOpen && monthData && (
        <WorkforceExport
          month={monthData}
          sites={sites}
          onClose={() => setExportOpen(false)}
        />
      )}
    </section>
  );
}
