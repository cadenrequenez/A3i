"use client";
import { useEffect, useState } from "react";
import { fetchFacilities } from "../lib/api";
import { getRole, getToken } from "../lib/auth";
import type { Facility } from "../lib/types";
import {
  workforceRequest,
  type RosterMember,
  type WorkforceSettings,
} from "../lib/workforce";
import StaffList from "./StaffList";

const labelFor = (site: Facility) =>
  /driscoll/i.test(site.site_name)
    ? "Driscoll MDs"
    : /utrgv/i.test(site.site_name)
      ? "UTRGV MDs"
      : /surgical|asc/i.test(site.site_name)
        ? "ASC MDs"
        : "Rio Grande MDs";
const isRio = (site: Facility) =>
  /rio/i.test(site.site_name) && !/surgical|asc/i.test(site.site_name);
export default function TeamRoster({ onSaved }: { onSaved: () => void }) {
  const [sites, setSites] = useState<Facility[]>([]);
  const [settings, setSettings] = useState<WorkforceSettings | null>(null);
  const [selected, setSelected] = useState("rio");
  const [query, setQuery] = useState("");
  const [removed, setRemoved] = useState(false);
  const [editor, setEditor] = useState<RosterMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const admin = getRole() === "admin";
  async function load() {
    setLoading(true);
    setError("");
    try {
      const [facilities, config] = await Promise.all([
        fetchFacilities(getToken()),
        workforceRequest<WorkforceSettings>("settings", getToken()),
      ]);
      setSites(facilities);
      setSettings(config);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (editor) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [editor]);
  const rio = sites.find(isRio);
  const driscoll = sites.find((s) => /driscoll/i.test(s.site_name));
  const otherSites = sites.filter(
    (s) => !isRio(s) && !/driscoll/i.test(s.site_name),
  );
  const group = selected === "rio" ? String(rio?.id || "") : selected;
  const isCrnaGroup = selected === "crnas" || selected.startsWith("crnas:");
  const crnaSite = selected.split(":")[1];
  const title = isCrnaGroup
    ? selected === "crnas"
      ? "Rio CRNA pool"
      : "Driscoll CRNAs"
    : labelFor(
        sites.find((s) => String(s.id) === group) || {
          id: 0,
          site_name: "Rio Grande",
        },
      );
  const members = settings
    ? selected === "crnas"
      ? settings.crnas
      : selected.startsWith("crnas:")
        ? settings.site_crnas?.[crnaSite] || []
        : settings.rosters[group] || []
    : [];
  const count = (key: string) =>
    (key === "crnas"
      ? settings?.crnas
      : key.startsWith("crnas:")
        ? settings?.site_crnas?.[key.split(":")[1]]
        : settings?.rosters[key]
    )?.filter((m) => m.active).length || 0;
  function choose(key: string) {
    setSelected(key);
    setQuery("");
    setRemoved(false);
    setNotice("");
    setError("");
  }
  async function persist(next: WorkforceSettings, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await workforceRequest<WorkforceSettings>(
        "settings",
        getToken(),
        {
          expected_revision: settings!.revision,
          rosters: next.rosters,
          crnas: next.crnas,
          site_crnas: next.site_crnas || {},
        },
      );
      setSettings(saved);
      setEditor(null);
      setNotice(message);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function saveMember(e: React.FormEvent) {
    e.preventDefault();
    if (!settings || !editor || busy) return;
    const name = editor.name.trim();
    if (!name) return;
    if (
      members.some(
        (m) =>
          m.key !== editor.key && m.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      setError(
        "This name is already on this roster. Show removed people to restore them.",
      );
      return;
    }
    const allMds = Object.values(settings.rosters).flat();
    const existing =
      !isCrnaGroup && !editor.key
        ? allMds.find((m) => m.name.toLowerCase() === name.toLowerCase())
        : undefined;
    const member = {
      ...editor,
      name,
      key:
        editor.key ||
        existing?.key ||
        `${isCrnaGroup ? "crna" : "md"}-custom-${crypto.randomUUID()}`,
    };
    const upsert = (list: RosterMember[]) =>
      list.some((m) => m.key === member.key)
        ? list.map((m) => (m.key === member.key ? member : m))
        : [...list, member];
    const next = structuredClone(settings);
    if (selected === "crnas") next.crnas = upsert(next.crnas);
    else if (isCrnaGroup)
      next.site_crnas = {
        ...next.site_crnas,
        [crnaSite]: upsert(next.site_crnas?.[crnaSite] || []),
      };
    else {
      // A clinician may belong to both facilities; keep their name consistent.
      next.rosters = Object.fromEntries(
        Object.entries(next.rosters).map(([id, list]) => [
          id,
          list.map((m) => (m.key === member.key ? { ...m, name } : m)),
        ]),
      );
      next.rosters[group] = upsert(next.rosters[group] || []);
    }
    void persist(next, `${name} saved to ${title}.`);
  }
  function removeMember(member: RosterMember) {
    if (!settings || busy) return;
    if (
      !window.confirm(
        `Remove ${member.name} from ${title}? Saved schedules will keep their name.`,
      )
    )
      return;
    const next = structuredClone(settings);
    const update = (list: RosterMember[]) =>
      list.map((m) => (m.key === member.key ? { ...m, active: false } : m));
    if (selected === "crnas") next.crnas = update(next.crnas);
    else if (isCrnaGroup)
      next.site_crnas = {
        ...next.site_crnas,
        [crnaSite]: update(next.site_crnas?.[crnaSite] || []),
      };
    else next.rosters[group] = update(next.rosters[group] || []);
    void persist(
      next,
      `${member.name} removed from ${title}. Saved schedules are unchanged.`,
    );
  }
  const navButton = (key: string, label: string, countKey: string) => (
    <button
      key={key}
      type="button"
      aria-pressed={selected === key}
      disabled={busy || !!editor}
      onClick={() => choose(key)}
    >
      {label}
      <span>{count(countKey)}</span>
    </button>
  );
  return (
    <section className="team-rosters" aria-label="Team rosters">
      <p className="team-intro">
        All your rosters, in one place. Rio Grande and Driscoll have separate MD
        teams. The Rio CRNA pool handles ASC and temporary transfers. Driscoll’s
        regular CRNAs have their own roster.
      </p>
      <nav className="team-roster-nav" aria-label="Choose team roster">
        {navButton("rio", "Rio Grande MDs", String(rio?.id || ""))}
        {driscoll &&
          navButton(String(driscoll.id), "Driscoll MDs", String(driscoll.id))}
        {navButton("crnas", "Rio CRNA pool", "crnas")}
        {driscoll &&
          navButton(
            `crnas:${driscoll.id}`,
            "Driscoll CRNAs",
            `crnas:${driscoll.id}`,
          )}
      </nav>
      {otherSites.length > 0 && (
        <details className="team-other-sites">
          <summary>Other facility MD rosters</summary>
          <div className="team-roster-nav">
            {otherSites.map((s) =>
              navButton(String(s.id), labelFor(s), String(s.id)),
            )}
          </div>
        </details>
      )}
      {loading && <p role="status">Loading your team…</p>}
      {error && (
        <div className="wf-error" role="alert">
          <p>{error}</p>
          {!editor && (
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => void load()}
            >
              Reload rosters
            </button>
          )}
        </div>
      )}
      {notice && (
        <p className="team-notice" role="status">
          {notice}
        </p>
      )}
      {!loading && settings && selected === "rio" && (
        <StaffList
          kind="mds"
          onSaved={() => {
            workforceRequest<WorkforceSettings>("settings", getToken())
              .then(setSettings)
              .catch((e) => setError((e as Error).message));
            onSaved();
          }}
        />
      )}
      {!loading && settings && selected !== "rio" && (
        <section className="team-roster-panel surface-card">
          <header className="team-roster-heading">
            <div>
              <p className="eyebrow">
                {isCrnaGroup ? "Home CRNA roster" : "Facility roster"}
              </p>
              <h2>{title}</h2>
              <p>
                {isCrnaGroup
                  ? "Home rosters stay separate. Change the daily assignment for a temporary transfer."
                  : "Only this facility’s MDs appear in its daily staffing dropdown."}
              </p>
            </div>
            {admin && (
              <button
                className="primary-button"
                disabled={busy || !!editor}
                onClick={() => {
                  setError("");
                  setNotice("");
                  setEditor({ key: "", name: "", active: true });
                }}
              >
                Add {isCrnaGroup ? "CRNA" : "MD"}
              </button>
            )}
          </header>
          <div className="team-roster-filters">
            <label>
              <span className="sr-only">Search {title}</span>
              <input
                placeholder="Search by name"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={removed}
                onChange={(e) => setRemoved(e.target.checked)}
              />{" "}
              Show removed people
            </label>
          </div>
          {editor && (
            <form
              className="team-member-editor"
              aria-label="Team member editor"
              onSubmit={saveMember}
            >
              <h3>
                {editor.key ? "Edit" : "Add"} {isCrnaGroup ? "CRNA" : "MD"}
              </h3>
              <label>
                Name
                <input
                  autoFocus
                  required
                  maxLength={100}
                  value={editor.name}
                  disabled={busy}
                  onChange={(e) =>
                    setEditor({ ...editor, name: e.target.value })
                  }
                />
              </label>
              <label className="team-active-label">
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={editor.active}
                  onChange={(e) =>
                    setEditor({ ...editor, active: e.target.checked })
                  }
                />{" "}
                Active on this roster
              </label>
              <div className="team-member-actions">
                <button className="primary-button" disabled={busy}>
                  {busy ? "Saving…" : "Save member"}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setEditor(null);
                    setError("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
          <ul className="team-members">
            {members
              .filter(
                (m) =>
                  (removed || m.active) &&
                  m.name.toLowerCase().includes(query.toLowerCase()),
              )
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((m) => (
                <li key={m.key}>
                  <div className="team-member-identity">
                    <span className="team-avatar" aria-hidden="true">
                      {m.name
                        .split(" ")
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((n) => n[0])
                        .join("")}
                    </span>
                    <div>
                      <strong>{m.name}</strong>
                      <small>
                        {m.active
                          ? selected === "crnas"
                            ? "CRNA · Shared pool"
                            : `MD · ${title.replace(" MDs", "")}`
                          : "Removed · Kept in saved schedules"}
                      </small>
                    </div>
                  </div>
                  {admin && (
                    <div className="team-member-actions">
                      <button
                        className="secondary-button"
                        aria-label={`${m.active ? "Edit" : "Restore"} ${m.name}`}
                        disabled={busy || !!editor}
                        onClick={() => {
                          setError("");
                          setNotice("");
                          setEditor({ ...m, active: true });
                        }}
                      >
                        {m.active ? "Edit" : "Restore"}
                      </button>
                      {m.active && (
                        <button
                          className="secondary-button"
                          aria-label={`Delete ${m.name} from ${title}`}
                          disabled={busy || !!editor}
                          onClick={() => removeMember(m)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
          </ul>
          {!members.some(
            (m) =>
              (removed || m.active) &&
              m.name.toLowerCase().includes(query.toLowerCase()),
          ) && (
            <p className="team-empty">
              {query
                ? "No matching names."
                : "No active members yet. Add a permanent team member to get started."}
            </p>
          )}
          <p className="team-roster-footnote">
            Temporary locums can be typed directly into a day’s schedule. They
            don’t need to be added to Team.
          </p>
        </section>
      )}
    </section>
  );
}
