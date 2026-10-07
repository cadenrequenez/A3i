"use client";
import { useEffect, useState } from "react";
import ScheduleBoard from "./ScheduleBoard";
import DriscollCalendar from "./DriscollCalendar";
import { fetchFacilities } from "../lib/api";
import { getToken } from "../lib/auth";
import type { Facility } from "../lib/types";

export default function ScheduleWorkspace({ accountKey, onOpenWorkforce }: { accountKey?: string; onOpenWorkforce:()=>void }) {
  const [calendar, setCalendar] = useState<"rio" | "driscoll">("rio");
  const [locked, setLocked] = useState(true);
  const [driscoll, setDriscoll] = useState<Facility | null>(null);
  useEffect(() => {
    fetchFacilities(getToken()).then(sites => setDriscoll(sites.find(site => /driscoll/i.test(site.site_name)) ?? null)).catch(() => {});
  }, []);
  return <>
    <div className="facility-calendar-picker">
      <span className="eyebrow">Call calendar</span>
      <div role="group" aria-label="Choose call calendar">
        <button aria-pressed={calendar === "rio"} disabled={locked && calendar !== "rio"} onClick={() => setCalendar("rio")}>Rio Grande</button>
        <button aria-pressed={calendar === "driscoll"} disabled={locked && calendar !== "driscoll"} onClick={() => setCalendar("driscoll")}>Driscoll Pediatrics <span>Blank template</span></button>
      </div>
      {locked && <small>Finish loading or save your day before switching calendars.</small>}
    </div>
    <div hidden={calendar !== "rio"}><ScheduleBoard accountKey={accountKey} onNavigationLockChange={setLocked}/></div>
    <div hidden={calendar !== "driscoll"}><DriscollCalendar facility={driscoll} onOpenWorkforce={onOpenWorkforce}/></div>
  </>;
}
