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
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">A3i Dashboard</h1>
        <p className="text-sm text-slate-600">
          Artificial Anesthesia Administrative Intelligence — scheduling, staffing, and facility insights.
        </p>
      </header>

      <TabNav activeTab={activeTab} tabs={[...TABS]} onChange={setActiveTab} />

      {activeTab === "Schedule" && <ScheduleBoard />}
      {activeTab === "Staff" && <StaffList />}
      {activeTab === "Sites" && <SitesList />}
      {activeTab === "Analytics" && (
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Analytics</h2>
          <p className="text-sm text-slate-600">Review staffing utilization and coverage compliance.</p>
        </section>
      )}
    </main>
  );
}
