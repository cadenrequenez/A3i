"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchCrnas, fetchMds } from "../lib/api";
import { getToken } from "../lib/auth";
import type { StaffMember } from "../lib/types";

export default function StaffList() {
  const [mds, setMds] = useState<StaffMember[]>([]);
  const [crnas, setCrnas] = useState<StaffMember[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    Promise.all([fetchMds(token), fetchCrnas(token)])
      .then(([mdData, crnaData]) => {
        setMds(mdData);
        setCrnas(crnaData);
      })
      .catch((err) => setError((err as Error).message));
  }, []);

  const filteredMds = useMemo(() => {
    return mds.filter((md) => md.name.toLowerCase().includes(query.toLowerCase()));
  }, [mds, query]);

  const filteredCrnas = useMemo(() => {
    return crnas.filter((crna) => crna.name.toLowerCase().includes(query.toLowerCase()));
  }, [crnas, query]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Staff</h2>
          <p className="text-sm text-slate-600">Browse MD and CRNA profiles.</p>
        </div>
        <input
          className="w-64 rounded border border-slate-300 bg-white/80 px-3 py-2 text-sm"
          placeholder="Search staff"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="surface-card rounded-xl p-4">
          <h3 className="text-sm font-semibold">MDs</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {filteredMds.length === 0 && <li className="text-slate-500">No MDs found.</li>}
            {filteredMds.map((md) => (
              <li key={md.id} className="flex items-center justify-between gap-2">
                <div>
                  <p>{md.name}</p>
                  <p className="text-xs text-slate-500">
                    {md.pedi_qualified ? "Pedi" : "No Pedi"} · {md.cv_qualified ? "CV" : "No CV"}
                  </p>
                </div>
                <span className="text-xs text-slate-400">ID {md.id}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="surface-card rounded-xl p-4">
          <h3 className="text-sm font-semibold">CRNAs</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {filteredCrnas.length === 0 && <li className="text-slate-500">No CRNAs found.</li>}
            {filteredCrnas.map((crna) => (
              <li key={crna.id} className="flex items-center justify-between gap-2">
                <div>
                  <p>{crna.name}</p>
                  <p className="text-xs text-slate-500">
                    {crna.pedi_qualified ? "Pedi" : "No Pedi"}
                  </p>
                </div>
                <span className="text-xs text-slate-400">ID {crna.id}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
