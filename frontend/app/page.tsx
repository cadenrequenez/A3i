"use client";

import { useState } from "react";
import TabNav from "../components/TabNav";
import ScheduleBoard from "../components/ScheduleBoard";
import StaffList from "../components/StaffList";
import SitesList from "../components/SitesList";

const TABS = ["Schedule", "Staff", "Sites", "Analytics"] as const;

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("Schedule");

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 pb-10">
      <header className="surface-card rounded-2xl p-6">
        <p className="mono text-xs uppercase tracking-[0.2em] text-sky-800">Operations Board</p>
        <h1 className="mt-2 text-3xl font-bold">A3i Dashboard</h1>
        <p className="mt-2 text-sm text-slate-700">
          Artificial Anesthesia Administrative Intelligence — scheduling, staffing, and facility insights.
        </p>
      </header>

      <TabNav activeTab={activeTab} tabs={[...TABS]} onChange={(tab) => setActiveTab(tab as (typeof TABS)[number])} />

      {activeTab === "Schedule" && <ScheduleBoard />}
      {activeTab === "Staff" && <StaffList />}
      {activeTab === "Sites" && <SitesList />}
      {activeTab === "Analytics" && (
        <section className="surface-card rounded-xl p-6">
          <h2 className="text-lg font-semibold">Analytics</h2>
          <p className="text-sm text-slate-600">Review staffing utilization and coverage compliance.</p>
        </section>
      )}
    </main>
  );
}
