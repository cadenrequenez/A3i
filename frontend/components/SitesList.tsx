"use client";

import { useEffect, useState } from "react";
import { fetchFacilities } from "../lib/api";
import { getToken } from "../lib/auth";
import type { Facility } from "../lib/types";

export default function SitesList() {
  const [sites, setSites] = useState<Facility[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    fetchFacilities(token)
      .then((data) => setSites(data))
      .catch((err) => setError((err as Error).message));
  }, []);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Sites</h2>
        <p className="text-sm text-slate-600">Facility staffing requirements at a glance.</p>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {sites.length === 0 && <p className="text-sm text-slate-500">No facilities found.</p>}
        {sites.map((site) => (
          <div key={site.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold">{site.site_name}</h3>
            <p className="mt-2 text-xs text-slate-500">Staffing requirements</p>
            <ul className="mt-2 text-sm text-slate-700">
              <li>MDs: {site.staffing_requirements?.md ?? "-"}</li>
              <li>CRNAs: {site.staffing_requirements?.crna ?? "-"}</li>
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
