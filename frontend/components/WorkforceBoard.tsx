"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchFacilities, fetchSchedules } from "../lib/api";
import { getRole, getToken } from "../lib/auth";
import type { Facility, ScheduleEntry } from "../lib/types";
import {
  emptyWorkforceDay,
  normalizeWorkforceDay,
  workforceDate,
  workforceRequest,
  type WorkforceDay,
  type WorkforceEntry,
  type WorkforceHistory,
  type WorkforceMonth,
  type WorkforcePayload,
  type WorkforceSettings,
  type RosterMember,
} from "../lib/workforce";
import { WorkforceSaveQueue } from "../lib/workforceSaveQueue";
import { workforceSiteName as shortSite } from "../lib/workforceWorkbook";
import WorkforceExport from "./WorkforceExport";
const chosen = (e: WorkforceEntry) => !!(e.guest ? e.name.trim() : e.key);
const clean = (p: WorkforcePayload) => ({
  ...p,
  entries: p.entries.filter(chosen),
});
const blankEntry = (
  kind: "md" | "crna",
  site: number | null,
  status: WorkforceEntry["status"] = "working",
): WorkforceEntry => ({
  kind,
  key: null,
  name: "",
  guest: false,
  site_id: site,
  home_site_id: site,
  status,
  note: "",
});
export default function WorkforceBoard({
  accountKey,
  onManageTeam,
  rosterVersion = 0,
  onSaveGuard,
}: {
  accountKey?: string;
  onManageTeam: () => void;
  rosterVersion?: number;
  onSaveGuard?: (guard: (() => Promise<boolean>) | null) => void;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear()),
    [month, setMonth] = useState(now.getMonth() + 1),
    [day, setDay] = useState(1);
  const [sites, setSites] = useState<Facility[]>([]),
    [settings, setSettings] = useState<WorkforceSettings | null>(null),
    [data, setData] = useState<WorkforceMonth | null>(null),
    [calls, setCalls] = useState<ScheduleEntry[]>([]);
  const [draft, setDraft] = useState<WorkforcePayload>(emptyWorkforceDay),
    [baseline, setBaseline] = useState<WorkforcePayload>(emptyWorkforceDay),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [navigating, setNavigating] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [section, setSection] = useState(""),
    [view, setView] = useState<"week" | "month" | "day">("week"),
    [exportOpen, setExportOpen] = useState(false),
    [copyDate, setCopyDate] = useState(""),
    [history, setHistory] = useState<WorkforceHistory[] | null>(null),
    [historyPreview, setHistoryPreview] = useState<WorkforceHistory | null>(
      null,
    );
  const draftRef = useRef(draft),
    dataRef = useRef(data),
    requestId = useRef(0),
    undo = useRef<WorkforcePayload[]>([]),
    dragIndex = useRef<number | null>(null);
  const date = workforceDate(year, month, day),
    count = new Date(year, month, 0).getDate(),
    canEdit = getRole() === "admin",
    prefix = `a3i-workforce-${accountKey || "account"}`;
  const dirty = JSON.stringify(clean(draft)) !== JSON.stringify(baseline);
  const label = new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const rio = sites.find((s) => shortSite(s) === "Rio"),
    driscoll = sites.find((s) => shortSite(s) === "Driscoll"),
    selected = sites.find((s) => String(s.id) === section);
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
  const allCrnas = useMemo(
    () => [
      ...(settings?.crnas || []),
      ...Object.values(settings?.site_crnas || {}).flat(),
    ],
    [settings],
  );
  const queue = useMemo(
    () =>
      new WorkforceSaveQueue({
        persist: async (snapshot) =>
          workforceRequest<WorkforceDay>(`day/${snapshot.date}`, getToken(), {
            expected_revision: snapshot.revision,
            payload: snapshot.payload,
          }),
        saved: (result, current) => {
          const next = {
            ...current,
            entries: [
              ...current.entries,
              ...draftRef.current.entries.filter((e) => !chosen(e)),
            ],
          };
          draftRef.current = next;
          setDraft(next);
          setBaseline(result.payload);
          setError("");
          const old = dataRef.current;
          if (
            old &&
            result.date.startsWith(
              `${old.year}-${String(old.month).padStart(2, "0")}`,
            )
          ) {
            const nextData = {
              ...old,
              status: "draft" as const,
              revision: result.month_revision ?? old.revision,
              days: [
                ...old.days.filter((d) => d.date !== result.date),
                result,
              ].sort((a, b) => a.date.localeCompare(b.date)),
            };
            dataRef.current = nextData;
            setData(nextData);
          }
        },
        failed: (e) => setError(e.message),
        saving: setSaving,
      }),
    [],
  );
  useEffect(() => {
    onSaveGuard?.(() => queue.flush());
    return () => onSaveGuard?.(null);
  }, [onSaveGuard, queue]);
  function showDay(d: number, m: WorkforceMonth) {
    const row = m.days.find(
        (r) => r.date === workforceDate(m.year, m.month, d),
      ),
      p = normalizeWorkforceDay(row?.payload);
    queue.reset(workforceDate(m.year, m.month, d), row?.revision || 0, p);
    draftRef.current = p;
    setDraft(p);
    setBaseline(p);
    setDay(d);
    undo.current = [];
    setHistory(null);
    setHistoryPreview(null);
    setError("");
    setNotice("");
  }
  async function load(y = year, m = month, d = day) {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const [f, s, result] = await Promise.all([
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
      setData(result);
      dataRef.current = result;
      setYear(y);
      setMonth(m);
      setSection(
        (current) =>
          current ||
          String(f.find((x) => shortSite(x) === "Rio")?.id || f[0]?.id || ""),
      );
      showDay(Math.min(d, new Date(y, m, 0).getDate()), result);
      void fetchSchedules(getToken())
        .then(setCalls)
        .catch(() => {});
    } catch (e) {
      if (id === requestId.current) setError((e as Error).message);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }
  useEffect(() => {
    let saved: number[] = [];
    try {
      saved = JSON.parse(localStorage.getItem(prefix) || "[]");
    } catch {}
    void load(
      saved[0] || now.getFullYear(),
      saved[1] || now.getMonth() + 1,
      saved[2] || 1,
    );
    return () => {
      // Invalidate whichever load is currently in flight on account change.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      requestId.current++;
      queue.reset("", 0, emptyWorkforceDay());
    };
  }, [accountKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!rosterVersion) return;
    let active = true;
    Promise.all([
      workforceRequest<WorkforceSettings>("settings", getToken()),
      workforceRequest<WorkforceMonth>(
        `month?year=${year}&month=${month}`,
        getToken(),
      ),
    ])
      .then(([s, m]) => {
        if (active) {
          setSettings(s);
          setData(m);
          dataRef.current = m;
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [rosterVersion, year, month]);
  useEffect(() => {
    if (!loading)
      localStorage.setItem(prefix, JSON.stringify([year, month, day]));
  }, [prefix, year, month, day, loading]);
  useEffect(() => {
    if (!dirty || loading || !canEdit || queue.blocked) return;
    const timer = setTimeout(() => void queue.flush(), 850);
    return () => clearTimeout(timer);
  }, [draft, dirty, loading, canEdit, queue]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (queue.dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [queue]);
  function change(p: WorkforcePayload, reviewed = false) {
    undo.current = [
      ...undo.current.slice(-19),
      structuredClone(draftRef.current),
    ];
    const next = { ...p, reviewed: reviewed ? p.reviewed : false };
    draftRef.current = next;
    setDraft(next);
    queue.update(clean(next));
    setNotice("");
    setHistoryPreview(null);
  }
  function edit(i: number, patch: Partial<WorkforceEntry>) {
    change({
      ...draftRef.current,
      entries: draftRef.current.entries.map((e, n) =>
        n === i ? { ...e, ...patch } : e,
      ),
    });
  }
  function append(e: WorkforceEntry) {
    change({ ...draftRef.current, entries: [...draftRef.current.entries, e] });
  }
  function remove(i: number) {
    change({
      ...draftRef.current,
      entries: draftRef.current.entries.filter((_, n) => n !== i),
    });
  }
  function move(i: number, to: number) {
    if (i === to || to < 0) return;
    const entries = [...draftRef.current.entries],
      e = entries.splice(i, 1)[0];
    entries.splice(to, 0, e);
    change({ ...draftRef.current, entries });
  }
  async function savedAction(action: () => void | Promise<void>) {
    if (navigating) return;
    setNavigating(true);
    try {
      if (await queue.flush()) await action();
    } finally {
      setNavigating(false);
    }
  }
  function navigate(d: number) {
    void savedAction(() => {
      if (dataRef.current) {
        showDay(d, dataRef.current);
        setView("day");
      }
    });
  }
  function monthMove(step: number) {
    const d = new Date(year, month - 1 + step, 1);
    if (d.getFullYear() < 2000 || d.getFullYear() > 2100) return;
    void savedAction(() => load(d.getFullYear(), d.getMonth() + 1, 1));
  }
  const inRelief = (e: WorkforceEntry) =>
    e.kind === "crna" &&
    e.status !== "off" &&
    e.status !== "post_call" &&
    e.home_site_id !== driscoll?.id &&
    (e.home_site_id !== null || e.site_id !== driscoll?.id);
  const visible = (e: WorkforceEntry) =>
    section === "relief"
      ? inRelief(e)
      : e.site_id === selected?.id && e.status !== "off";
  const shown = draft.entries
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => visible(e));
  const crnaRows = shown.filter(({ e }) => e.kind === "crna");
  const currentSaved = data?.days.find((d) => d.date === date);
  function source(e: WorkforceEntry) {
    return e.kind === "md"
      ? e.status === "off" || e.status === "post_call"
        ? allMds
        : settings?.rosters[String(e.site_id)] || []
      : e.status === "off"
        ? allCrnas
        : e.home_site_id === driscoll?.id
          ? settings?.site_crnas?.[String(driscoll?.id)] || []
          : settings?.crnas || [];
  }
  function nameSelect(
    e: WorkforceEntry,
    apply: (patch: Partial<WorkforceEntry>) => void,
    name: string,
  ) {
    const members = source(e);
    return e.guest ? (
      <div className="wd-guest">
        <input
          aria-label={name}
          maxLength={100}
          placeholder="Temporary name · this day only"
          value={e.name}
          onChange={(ev) => apply({ name: ev.target.value })}
        />
        <button
          type="button"
          onClick={() => apply({ guest: false, key: null, name: "" })}
        >
          Roster
        </button>
      </div>
    ) : (
      <select
        aria-label={name}
        value={e.key || ""}
        onChange={(ev) => {
          const m = members.find((m) => m.key === ev.target.value);
          apply(
            ev.target.value === "guest"
              ? { guest: true, key: null, name: "" }
              : { key: m?.key || null, name: m?.name || "" },
          );
        }}
      >
        <option value="">Choose a name</option>
        {members
          .filter((m) => m.active || m.key === e.key)
          .map((m) => (
            <option key={m.key} value={m.key}>
              {m.name}
              {m.active ? "" : " (removed)"}
            </option>
          ))}
        <option value="guest">Type temporary clinician…</option>
      </select>
    );
  }
  function mdSlot(i: number | undefined, slot: number) {
    const e =
      i === undefined ? blankEntry("md", selected!.id) : draft.entries[i];
    return (
      <div className="wd-md-slot" key={i ?? `blank-${slot}`}>
        <span>MD {slot + 1}</span>
        {nameSelect(
          e,
          (patch) =>
            i === undefined ? append({ ...e, ...patch }) : edit(i, patch),
          `${shortSite(selected!)} MD ${slot + 1}`,
        )}
        {i !== undefined && (
          <button
            aria-label={`Remove ${e.name || "MD"}`}
            onClick={() => remove(i)}
          >
            ×
          </button>
        )}
      </div>
    );
  }
  function offSelect(kind: "md" | "crna") {
    const e = blankEntry(kind, null, "off");
    return nameSelect(
      e,
      (patch) => append({ ...e, ...patch }),
      `Add ${kind.toUpperCase()} off`,
    );
  }
  const offset = new Date(year, month - 1, 1).getDay();
  const cells = [
    ...Array.from({ length: offset }, () => 0),
    ...Array.from({ length: count }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(0);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) =>
    cells.slice(i * 7, i * 7 + 7),
  );
  const currentWeek = weeks.find((w) => w.includes(day)) || weeks[0];
  function summary(d: number) {
    const row = data?.days.find(
      (r) => r.date === workforceDate(year, month, d),
    );
    const p = row?.payload || emptyWorkforceDay();
    const entries = p.entries.filter(visible);
    return (
      <>
        <div className="wd-overview-head">
          <strong>{d}</strong>
          <small>
            {p.reviewed
              ? "Done"
              : entries.some(chosen)
                ? "In progress"
                : "Blank"}
          </small>
        </div>
        {section !== "relief" && (
          <div className="wd-overview-names">
            <b>MDs</b>
            {entries
              .filter((e) => e.kind === "md" && e.status !== "post_call")
              .map((e, i) => (
                <span key={i}>{e.name}</span>
              ))}
            {entries
              .filter((e) => e.status === "post_call")
              .map((e, i) => (
                <span className="wd-post" key={`post-${i}`}>
                  *{e.name}
                </span>
              ))}
          </div>
        )}
        <div className="wd-overview-names">
          <b>{section === "relief" ? "Relief order" : "CRNAs"}</b>
          {entries
            .filter((e) => e.kind === "crna")
            .map((e, i) => (
              <span key={i}>
                {e.name}
                {section === "relief" &&
                  ` · ${shortSite(sites.find((s) => s.id === e.site_id) || sites[0])}`}
                {e.note && ` · ${e.note}`}
              </span>
            ))}
        </div>
        {p.entries.some((e) => e.status === "off") && (
          <small className="wd-office">
            Off · office only:{" "}
            {p.entries
              .filter((e) => e.status === "off")
              .map((e) => e.name)
              .join(", ")}
          </small>
        )}
      </>
    );
  }
  const done = data?.days.filter((d) => d.payload.reviewed).length || 0;
  return (
    <section className="wf-board wd-board" aria-label="Daily workforce">
      <header className="wf-header">
        <div>
          <p className="eyebrow">Workforce calendars</p>
          <h1>Your day, clearly arranged.</h1>
          <p>Separate site calendars. One saved plan.</p>
        </div>
        <div className="wf-toolbar">
          <button
            disabled={loading || navigating}
            onClick={() => void savedAction(onManageTeam)}
          >
            Manage team
          </button>
          <button
            disabled={loading || navigating || !data}
            onClick={() => void savedAction(() => setExportOpen(true))}
          >
            Print / Save
          </button>
        </div>
      </header>
      <nav className="wd-site-tabs" aria-label="Choose workforce calendar">
        {sites.map((s) => (
          <button
            key={s.id}
            aria-pressed={section === String(s.id)}
            onClick={() => setSection(String(s.id))}
          >
            {shortSite(s)}
            {shortSite(s) === "ASC" && <small>Daily staffing</small>}
          </button>
        ))}
        <button
          aria-pressed={section === "relief"}
          onClick={() => setSection("relief")}
        >
          Rio CRNA relief
        </button>
      </nav>
      <div className="wd-monthbar">
        <button
          aria-label="Previous workforce month"
          disabled={loading || navigating || (year === 2000 && month === 1)}
          onClick={() => monthMove(-1)}
        >
          ←
        </button>
        <h2>{label}</h2>
        <button
          aria-label="Next workforce month"
          disabled={loading || navigating || (year === 2100 && month === 12)}
          onClick={() => monthMove(1)}
        >
          →
        </button>
        <span>
          {done}/{count} days marked Done · Private draft
        </span>
        <div role="group" aria-label="Workforce view">
          {(["week", "month", "day"] as const).map((v) => (
            <button
              key={v}
              aria-pressed={view === v}
              onClick={() => setView(v)}
            >
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <div className="wf-error" role="alert">
          <p>{error}</p>
          {settings ? (
            <>
              <button disabled={saving} onClick={() => void queue.flush(true)}>
                Retry save
              </button>
              <button
                disabled={saving}
                onClick={() => {
                  if (
                    window.confirm(
                      "Discard unsaved edits and reload the saved day?",
                    )
                  )
                    void load();
                }}
              >
                Reload saved day
              </button>
            </>
          ) : (
            <button onClick={() => void load()}>Try again</button>
          )}
        </div>
      )}
      {notice && (
        <p className="wf-notice" role="status">
          {notice}
        </p>
      )}
      {loading ? (
        <p role="status">Loading your saved workforce…</p>
      ) : (
        settings &&
        data && (
          <>
            {view !== "day" ? (
              <>
                <div className="wd-overview-toolbar">
                  <p>
                    {section === "relief"
                      ? "The Rio pool stays in your relief order, including ASC and temporary transfers."
                      : `${selected ? shortSite(selected) : "Site"} workforce · Select a day to enter or change names.`}
                  </p>
                  {view === "week" && (
                    <div>
                      <button
                        disabled={navigating || currentWeek.includes(1)}
                        onClick={() =>
                          void savedAction(() => {
                            if (dataRef.current)
                              showDay(Math.max(1, day - 7), dataRef.current);
                          })
                        }
                      >
                        Previous week
                      </button>
                      <button
                        disabled={navigating || currentWeek.includes(count)}
                        onClick={() =>
                          void savedAction(() => {
                            if (dataRef.current)
                              showDay(
                                Math.min(count, day + 7),
                                dataRef.current,
                              );
                          })
                        }
                      >
                        Next week
                      </button>
                    </div>
                  )}
                </div>
                <div
                  className={`wd-overview ${view === "month" ? "wd-month" : "wd-week"}`}
                  role="group"
                  aria-label={`${selected ? shortSite(selected) : "Rio relief"} ${view} calendar`}
                >
                  {(view === "week" ? currentWeek.filter(Boolean) : cells).map(
                    (d, i) =>
                      d ? (
                        <button
                          className={`wd-date ${d === day ? "selected" : ""}`}
                          key={d}
                          disabled={navigating}
                          aria-label={`Edit workforce ${workforceDate(year, month, d)}`}
                          onClick={() => navigate(d)}
                        >
                          <span className="wd-weekday">
                            {new Date(year, month - 1, d).toLocaleDateString(
                              "en-US",
                              { weekday: "short" },
                            )}
                          </span>
                          {summary(d)}
                        </button>
                      ) : (
                        <div className="wd-date-empty" key={`empty-${i}`} />
                      ),
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="wd-daybar">
                  <div>
                    <p className="eyebrow">
                      {section === "relief"
                        ? "Rio pool · Relief order"
                        : `${selected ? shortSite(selected) : "Site"} · Day sheet`}
                    </p>
                    <h2>
                      {new Date(year, month - 1, day).toLocaleDateString(
                        "en-US",
                        { weekday: "long", month: "long", day: "numeric" },
                      )}
                    </h2>
                  </div>
                  <div>
                    <button onClick={() => setView("week")}>
                      Back to week
                    </button>
                    <input
                      type="date"
                      aria-label="Workforce day"
                      min="2000-01-01"
                      max="2100-12-31"
                      value={date}
                      disabled={navigating}
                      onChange={(e) => {
                        const [y, m, d] = e.target.value.split("-").map(Number);
                        if (y >= 2000 && y <= 2100 && m && d)
                          void savedAction(() =>
                            y === year && m === month
                              ? showDay(d, dataRef.current!)
                              : load(y, m, d),
                          );
                      }}
                    />
                  </div>
                </div>
                <div className="wd-daytools">
                  <button
                    disabled={day === 1 || navigating}
                    onClick={() => navigate(day - 1)}
                  >
                    Previous day
                  </button>
                  <button
                    disabled={day === count || navigating}
                    onClick={() => navigate(day + 1)}
                  >
                    Next day
                  </button>
                  <details>
                    <summary>Copy a saved day</summary>
                    <label>
                      Source day
                      <select
                        value={copyDate}
                        onChange={(e) => setCopyDate(e.target.value)}
                      >
                        <option value="">Choose saved day</option>
                        {data.days
                          .filter((d) => d.date !== date)
                          .map((d) => (
                            <option key={d.date} value={d.date}>
                              {d.date}
                            </option>
                          ))}
                      </select>
                    </label>
                    <p>
                      Copies staffing for this calendar. Off and post-call are
                      kept separate.
                    </p>
                    <button
                      disabled={!copyDate || !canEdit}
                      onClick={() => {
                        const p = data.days.find(
                          (d) => d.date === copyDate,
                        )?.payload;
                        if (!p) return;
                        if (
                          shown.some(({ e }) => chosen(e)) &&
                          !window.confirm(
                            "Replace this calendar’s day assignments with the selected saved day?",
                          )
                        )
                          return;
                        const copied = p.entries.filter(
                          (e) => visible(e) && e.status !== "post_call",
                        );
                        change({
                          ...draftRef.current,
                          entries: [
                            ...draftRef.current.entries.filter(
                              (e) => !visible(e) || e.status === "post_call",
                            ),
                            ...structuredClone(copied),
                          ],
                          sites: selected
                            ? {
                                ...draftRef.current.sites,
                                [selected.id]: p.sites[selected.id] || {
                                  closed: false,
                                  md: null,
                                  crna: null,
                                  note: "",
                                },
                              }
                            : draftRef.current.sites,
                        });
                        setNotice(`Copied staffing from ${copyDate}.`);
                      }}
                    >
                      Copy into this day
                    </button>
                  </details>
                </div>
                <fieldset
                  disabled={!canEdit || navigating}
                  className="wd-fieldset"
                >
                  <div
                    className={`wd-day-grid ${section === "relief" ? "relief-only" : ""}`}
                  >
                    {selected && (
                      <section className="wd-md-card">
                        <header>
                          <h3>{shortSite(selected)} MDs</h3>
                          <span>
                            {draft.sites[selected.id]?.md ??
                              selected.staffing_requirements?.md ??
                              0}{" "}
                            needed
                          </span>
                        </header>
                        <div>
                          {(() => {
                            const rows = shown.filter(
                              ({ e }) =>
                                e.kind === "md" && e.status !== "post_call",
                            );
                            const target =
                              draft.sites[selected.id]?.md ??
                              selected.staffing_requirements?.md ??
                              0;
                            return Array.from(
                              { length: Math.max(target, rows.length) },
                              (_, n) => mdSlot(rows[n]?.i, n),
                            );
                          })()}
                          <button
                            className="wd-add"
                            onClick={() =>
                              append(blankEntry("md", selected.id))
                            }
                          >
                            + Extra / temporary MD
                          </button>
                        </div>
                        <details>
                          <summary>Post-call · *</summary>
                          <p>
                            A separate annotation. It does not mark someone Off
                            or add a clinical assignment.
                          </p>
                          {nameSelect(
                            blankEntry("md", selected.id, "post_call"),
                            (patch) =>
                              append({
                                ...blankEntry("md", selected.id, "post_call"),
                                ...patch,
                              }),
                            "Add post-call MD",
                          )}
                          {shown
                            .filter(({ e }) => e.status === "post_call")
                            .map(({ e, i }) => (
                              <div key={i} className="wd-chip">
                                *{e.name}
                                {!chosen(e) &&
                                  nameSelect(
                                    e,
                                    (p) => edit(i, p),
                                    "Post-call MD",
                                  )}
                                <button
                                  aria-label={`Remove post-call ${e.name}`}
                                  onClick={() => remove(i)}
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          {(() => {
                            const yesterday = new Date(
                              year,
                              month - 1,
                              day - 1,
                            );
                            const c = calls.find(
                              (c) =>
                                c.date ===
                                  workforceDate(
                                    yesterday.getFullYear(),
                                    yesterday.getMonth() + 1,
                                    yesterday.getDate(),
                                  ) && /regional hospital/i.test(c.facility),
                            );
                            const name = c?.callFirstName;
                            const member = allMds.find((m) => m.name === name);
                            return name && shortSite(selected) === "Rio" ? (
                              <button
                                disabled={shown.some(
                                  ({ e }) =>
                                    e.status === "post_call" && e.name === name,
                                )}
                                onClick={() =>
                                  append({
                                    ...blankEntry(
                                      "md",
                                      selected.id,
                                      "post_call",
                                    ),
                                    key: member?.key || null,
                                    name,
                                    guest: !member,
                                  })
                                }
                              >
                                Add *{name} · previous 1st call
                              </button>
                            ) : null;
                          })()}
                        </details>
                      </section>
                    )}
                    <div>
                      <section className="wd-crna-card">
                        <header>
                          <h3>
                            {section === "relief"
                              ? "CRNA order of relief"
                              : "CRNA assignments"}
                          </h3>
                          <span>
                            {crnaRows.filter(({ e }) => chosen(e)).length}{" "}
                            listed
                          </span>
                        </header>
                        <p className="wd-caption">
                          Drag a row or use ↑ ↓. Notes stay exactly as entered.
                        </p>
                        {crnaRows.map(({ e, i }, rank) => (
                          <div
                            className="wd-crna-row"
                            key={i}
                            onDragOver={(ev) => ev.preventDefault()}
                            onDrop={(ev) => {
                              ev.preventDefault();
                              if (dragIndex.current !== null)
                                move(dragIndex.current, i);
                              dragIndex.current = null;
                            }}
                          >
                            <div className="wd-rank">
                              <button
                                draggable
                                aria-label={`Drag ${e.name || "CRNA"}`}
                                onDragStart={() => {
                                  dragIndex.current = i;
                                }}
                                onDragEnd={() => {
                                  dragIndex.current = null;
                                }}
                              >
                                {rank + 1} ⋮
                              </button>
                              <button
                                aria-label={`Move ${e.name || "CRNA"} earlier in relief order`}
                                disabled={rank === 0}
                                onClick={() => move(i, crnaRows[rank - 1].i)}
                              >
                                ↑
                              </button>
                              <button
                                aria-label={`Move ${e.name || "CRNA"} later in relief order`}
                                disabled={rank === crnaRows.length - 1}
                                onClick={() => move(i, crnaRows[rank + 1].i)}
                              >
                                ↓
                              </button>
                            </div>
                            <label>
                              <span>CRNA</span>
                              {nameSelect(
                                e,
                                (p) => edit(i, p),
                                "CRNA assignment name",
                              )}
                            </label>
                            <label>
                              <span>Facility</span>
                              <select
                                aria-label={`Location for ${e.name || "CRNA"}`}
                                value={e.site_id || ""}
                                onChange={(ev) =>
                                  edit(i, { site_id: Number(ev.target.value) })
                                }
                              >
                                {sites.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {shortSite(s)}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              <span>Note</span>
                              <input
                                aria-label={`Note for ${e.name || "CRNA"}`}
                                value={e.note}
                                maxLength={250}
                                placeholder="11am, 7–3, Out by 3:30pm"
                                onChange={(ev) =>
                                  edit(i, { note: ev.target.value })
                                }
                              />
                            </label>
                            <button
                              aria-label={`Remove ${e.name || "CRNA assignment"}`}
                              onClick={() => remove(i)}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <div className="wd-new-crna">
                          <label>
                            <span>Add CRNA</span>
                            {nameSelect(
                              blankEntry(
                                "crna",
                                selected?.id || rio?.id || null,
                              ),
                              (patch) =>
                                append({
                                  ...blankEntry(
                                    "crna",
                                    selected?.id || rio?.id || null,
                                  ),
                                  home_site_id:
                                    selected?.id === driscoll?.id
                                      ? driscoll?.id || null
                                      : rio?.id || null,
                                  ...patch,
                                }),
                              "Add CRNA",
                            )}
                          </label>
                          {selected &&
                            driscoll &&
                            selected.id === driscoll.id && (
                              <label>
                                <span>Bring someone from Rio</span>
                                {nameSelect(
                                  {
                                    ...blankEntry("crna", selected.id),
                                    home_site_id: rio?.id || null,
                                  },
                                  (patch) =>
                                    append({
                                      ...blankEntry("crna", selected.id),
                                      home_site_id: rio?.id || null,
                                      ...patch,
                                    }),
                                  "Transfer Rio CRNA to Driscoll",
                                )}
                              </label>
                            )}
                        </div>
                      </section>
                      <section className="wd-off">
                        <header>
                          <h3>Off for this day</h3>
                          <span>Dad & office staff only</span>
                        </header>
                        <div className="wd-off-selects">
                          <label>
                            <span>MD off</span>
                            {offSelect("md")}
                          </label>
                          <label>
                            <span>CRNA off</span>
                            {offSelect("crna")}
                          </label>
                        </div>
                        <div className="wd-chips">
                          {draft.entries.map((e, i) =>
                            e.status === "off" ? (
                              <div className="wd-chip" key={i}>
                                {chosen(e)
                                  ? e.name
                                  : nameSelect(
                                      e,
                                      (p) => edit(i, p),
                                      `${e.kind.toUpperCase()} off name`,
                                    )}
                                <button
                                  aria-label={`Remove off ${e.name || "selection"}`}
                                  onClick={() => remove(i)}
                                >
                                  ×
                                </button>
                              </div>
                            ) : null,
                          )}
                        </div>
                      </section>
                    </div>
                  </div>
                  <details className="wd-options">
                    <summary>Day options & private notes</summary>
                    {selected && (
                      <>
                        <label className="wd-check">
                          <input
                            type="checkbox"
                            checked={!!draft.sites[selected.id]?.closed}
                            onChange={(e) =>
                              change({
                                ...draftRef.current,
                                sites: {
                                  ...draftRef.current.sites,
                                  [selected.id]: {
                                    ...(draftRef.current.sites[selected.id] || {
                                      closed: false,
                                      md: null,
                                      crna: null,
                                      note: "",
                                    }),
                                    closed: e.target.checked,
                                  },
                                },
                              })
                            }
                          />
                          Site closed
                        </label>
                        {(["md", "crna"] as const).map((k) => (
                          <label key={k}>
                            {k.toUpperCase()} needed
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={draft.sites[selected.id]?.[k] ?? ""}
                              placeholder={String(
                                selected.staffing_requirements?.[k] || 0,
                              )}
                              onChange={(e) =>
                                change({
                                  ...draftRef.current,
                                  sites: {
                                    ...draftRef.current.sites,
                                    [selected.id]: {
                                      ...(draftRef.current.sites[
                                        selected.id
                                      ] || {
                                        closed: false,
                                        md: null,
                                        crna: null,
                                        note: "",
                                      }),
                                      [k]:
                                        e.target.value === ""
                                          ? null
                                          : Number(e.target.value),
                                    },
                                  },
                                })
                              }
                            />
                          </label>
                        ))}
                      </>
                    )}
                    <label>
                      Private office note
                      <textarea
                        value={draft.note}
                        maxLength={2000}
                        onChange={(e) =>
                          change({ ...draftRef.current, note: e.target.value })
                        }
                      />
                    </label>
                    {shown.map(({ e, i }) =>
                      e.status !== "post_call" && e.status !== "off" ? (
                        <label className="wd-check" key={i}>
                          <input
                            type="checkbox"
                            checked={e.status === "admin"}
                            onChange={(ev) =>
                              edit(i, {
                                status: ev.target.checked ? "admin" : "working",
                              })
                            }
                          />
                          {e.name || e.kind} · Admin duty
                        </label>
                      ) : null,
                    )}
                  </details>
                </fieldset>
                <div className="wd-savebar">
                  <span role="status" aria-live="polite">
                    {saving
                      ? "Saving…"
                      : error && dirty
                        ? "Not saved · edits retained"
                        : dirty
                          ? "Saving shortly…"
                          : currentSaved
                            ? "Saved · you can continue anytime"
                            : "Blank day · no assignments saved"}
                  </span>
                  <div>
                    <button
                      disabled={!dirty || saving || !canEdit}
                      onClick={() => void queue.flush(true)}
                    >
                      Save now
                    </button>
                    <button
                      disabled={!undo.current.length || !canEdit}
                      onClick={() => {
                        const p = undo.current.pop();
                        if (p) {
                          draftRef.current = p;
                          setDraft(p);
                          queue.update(clean(p));
                        }
                      }}
                    >
                      Undo
                    </button>
                    <label className="wd-check">
                      <input
                        type="checkbox"
                        disabled={!canEdit}
                        checked={draft.reviewed}
                        onChange={(e) =>
                          change(
                            { ...draftRef.current, reviewed: e.target.checked },
                            true,
                          )
                        }
                      />
                      Done · all calendars for this day
                    </label>
                    <button
                      disabled={navigating}
                      onClick={() =>
                        void savedAction(() => {
                          const next =
                            Array.from({ length: count }, (_, i) => i + 1).find(
                              (d) =>
                                d > day &&
                                !dataRef.current?.days.find(
                                  (r) =>
                                    r.date === workforceDate(year, month, d),
                                )?.payload.reviewed,
                            ) ||
                            Array.from({ length: count }, (_, i) => i + 1).find(
                              (d) =>
                                !dataRef.current?.days.find(
                                  (r) =>
                                    r.date === workforceDate(year, month, d),
                                )?.payload.reviewed,
                            );
                          if (next && dataRef.current)
                            showDay(next, dataRef.current);
                        })
                      }
                    >
                      Next unfinished
                    </button>
                  </div>
                </div>
                {currentSaved?.warnings.length ? (
                  <details className="wd-warnings">
                    <summary>
                      Staffing checks · {currentSaved.warnings.length}
                    </summary>
                    {currentSaved.warnings.map((w, i) => (
                      <p key={i}>{w}</p>
                    ))}
                    <p>
                      Partial days always save. Done records your progress; it
                      does not certify coverage.
                    </p>
                  </details>
                ) : null}
                <details className="wd-history">
                  <summary
                    onClick={() => {
                      if (!history)
                        void workforceRequest<WorkforceHistory[]>(
                          `day/${date}/history`,
                          getToken(),
                        )
                          .then(setHistory)
                          .catch((e) => setError(e.message));
                    }}
                  >
                    Previous saved versions
                  </summary>
                  {history?.map((h) => (
                    <button
                      key={h.revision}
                      onClick={() => setHistoryPreview(h)}
                    >
                      Preview v{h.revision} ·{" "}
                      {new Date(h.created_at).toLocaleString()}
                    </button>
                  ))}
                  {historyPreview && (
                    <div>
                      <p>
                        Version {historyPreview.revision}:{" "}
                        {historyPreview.payload.entries?.length || 0} entries.
                        Applying restores the whole day across sites.
                      </p>
                      <button
                        disabled={!canEdit}
                        onClick={() => {
                          change(normalizeWorkforceDay(historyPreview.payload));
                          setHistoryPreview(null);
                        }}
                      >
                        Apply this version
                      </button>
                    </div>
                  )}
                </details>
              </>
            )}
          </>
        )
      )}
      {exportOpen && data && (
        <WorkforceExport
          month={data}
          sites={sites}
          initialSection={section}
          onClose={() => setExportOpen(false)}
        />
      )}
    </section>
  );
}
