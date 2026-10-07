"use client";
import { useEffect, useState } from "react";
import { fetchCrnas, fetchMds, saveStaff } from "../lib/api";
import { getRole, getToken } from "../lib/auth";
import type { StaffMember } from "../lib/types";
type Kind = "mds" | "crnas";
export default function StaffList({
  kind: selectedKind,
  onSaved,
}: {
  kind?: Kind;
  onSaved?: () => void;
}) {
  const [staff, setStaff] = useState<Record<Kind, StaffMember[]>>({
    mds: [],
    crnas: [],
  });
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [admin, setAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);
  const [editor, setEditor] = useState<{
    kind: Kind;
    person: Partial<StaffMember>;
  } | null>(null);
  useEffect(() => {
    setAdmin(getRole() === "admin");
    Promise.all([fetchMds(getToken()), fetchCrnas(getToken())])
      .then(([mds, crnas]) => setStaff({ mds, crnas }))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editor) return;
    setSaving(true);
    setError(null);
    setMessage("");
    try {
      const person = await saveStaff(
        editor.kind,
        { ...editor.person, name: editor.person.name?.trim() },
        getToken(),
      );
      setStaff((previous) => ({
        ...previous,
        [editor.kind]: editor.person.id
          ? previous[editor.kind].map((p) => (p.id === person.id ? person : p))
          : [...previous[editor.kind], person],
      }));
      setMessage(`${person.name} saved.`);
      setEditor(null);
      onSaved?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function remove(kind: Kind, person: StaffMember) {
    if (
      !window.confirm(
        `Delete ${person.name} from the active roster? Earlier saved assignments will stay readable.`,
      )
    )
      return;
    setSaving(true);
    setError(null);
    setMessage("");
    try {
      const updated = await saveStaff(
        kind,
        { id: person.id, active: false },
        getToken(),
      );
      setStaff((previous) => ({
        ...previous,
        [kind]: previous[kind].map((p) => (p.id === person.id ? updated : p)),
      }));
      setMessage(
        `${person.name} removed from the roster. To restore them, show removed staff and edit their Active setting.`,
      );
      if (editor?.person.id === person.id) setEditor(null);
      onSaved?.();
      onSaved?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {selectedKind === "mds" ? "Rio Grande MDs" : "Staff"}
          </h2>
          <p className="text-sm text-slate-600">
            {selectedKind === "mds"
              ? "Your existing Rio roster for call and daily staffing."
              : "Manage your roster."}{" "}
            Removed staff stay in saved schedules.
          </p>
        </div>
        <input
          aria-label="Search staff by name"
          placeholder="Search staff by name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={showRemoved}
          onChange={(e) => setShowRemoved(e.target.checked)}
        />
        Show removed staff
      </label>
      {loading && <p role="status">Loading your team…</p>}
      {error && (
        <p role="alert" className="status-message">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="status-message">
          {message}
        </p>
      )}
      {editor && (
        <form
          onSubmit={save}
          className="surface-card rounded-xl p-5 space-y-4"
          aria-label="Staff editor"
        >
          <h3 className="text-lg font-semibold">
            {editor.person.id ? "Edit" : "Add"}{" "}
            {editor.kind === "mds" ? "MD" : "CRNA"}
          </h3>
          <label className="block">
            Full name
            <input
              autoFocus
              required
              maxLength={120}
              className="mt-2 w-full"
              value={editor.person.name || ""}
              onChange={(e) =>
                setEditor({
                  ...editor,
                  person: { ...editor.person, name: e.target.value },
                })
              }
            />
          </label>
          {(
            [
              ["active", "Active on roster"],
              ["pedi_qualified", "Pediatric qualified"],
              ["cv_qualified", "CV qualified"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!editor.person[key]}
                onChange={(e) =>
                  setEditor({
                    ...editor,
                    person: { ...editor.person, [key]: e.target.checked },
                  })
                }
              />
              {label}
            </label>
          ))}
          <p className="text-sm text-slate-600">
            Roster changes apply to future scheduling. Existing assignments stay
            saved.
          </p>
          <div className="flex gap-3">
            <button className="primary-button" disabled={saving}>
              {saving ? "Saving…" : "Save staff member"}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={saving}
              onClick={() => setEditor(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      <div className={`grid gap-4 ${selectedKind ? "" : "md:grid-cols-2"}`}>
        {(selectedKind ? [selectedKind] : (["mds", "crnas"] as Kind[])).map(
          (kind) => (
            <section key={kind} className="surface-card rounded-xl p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">
                  {kind === "mds" ? "MDs" : "CRNAs"} ·{" "}
                  {staff[kind].filter((p) => p.active !== false).length} active
                </h3>
                {admin && (
                  <button
                    className="secondary-button"
                    disabled={loading || saving}
                    onClick={() => {
                      setError(null);
                      setEditor({
                        kind,
                        person: {
                          name: "",
                          active: true,
                          pedi_qualified: false,
                          cv_qualified: false,
                        },
                      });
                    }}
                  >
                    Add {kind === "mds" ? "MD" : "CRNA"}
                  </button>
                )}
              </div>
              <ul className="mt-3 space-y-2 text-sm">
                {staff[kind]
                  .filter(
                    (p) =>
                      (showRemoved || p.active !== false) &&
                      p.name.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-3"
                    >
                      <div>
                        <p>{p.name}</p>
                        <p className="text-xs text-slate-500">
                          {p.active === false ? "Inactive · " : ""}
                          {p.pedi_qualified ? "Pedi" : "General"} ·{" "}
                          {p.cv_qualified ? "CV" : "Non-CV"}
                        </p>
                      </div>
                      {admin && (
                        <div className="flex gap-2">
                          <button
                            className="secondary-button"
                            aria-label={`Edit ${p.name}`}
                            disabled={saving}
                            onClick={() => {
                              setError(null);
                              setEditor({ kind, person: { ...p } });
                            }}
                          >
                            Edit
                          </button>
                          {p.active !== false && (
                            <button
                              className="secondary-button"
                              aria-label={`Delete ${p.name} from roster`}
                              disabled={saving}
                              onClick={() => remove(kind, p)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
              </ul>
            </section>
          ),
        )}
      </div>
    </section>
  );
}
