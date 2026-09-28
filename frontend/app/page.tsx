"use client";
import { useEffect, useState } from "react";
import ScheduleBoard from "../components/ScheduleBoard";
import StaffList from "../components/StaffList";
import SitesList from "../components/SitesList";
import AnalyticsPanel from "../components/AnalyticsPanel";
import { getToken } from "../lib/auth";
import { API_BASE_URL } from "../lib/connection";
import { fetchProfile, type AccountProfile } from "../lib/api";
const TABS = ["Schedule", "Staff", "Sites", "Analytics"] as const;
const icons = ["M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z", "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8m8 .13a4 4 0 0 1 0 7.75", "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6", "M4 19V9m8 10V4m8 15v-7M2 22h20"];
export default function DashboardPage() {
 const [activeTab,setActiveTab]=useState<(typeof TABS)[number]>("Schedule");
 const [profile,setProfile]=useState<AccountProfile|null>(null);
 useEffect(()=>{fetchProfile(getToken()).then(setProfile).catch(()=>{});},[]);
 const [signingOut,setSigningOut]=useState(false);
 async function signOut(){
  setSigningOut(true);
  try { await fetch(`${API_BASE_URL}/api/v1/auth/logout`,{method:"POST",headers:{Authorization:`Bearer ${getToken()}`},signal:AbortSignal.timeout(5000)}); } catch {}
  finally { localStorage.removeItem("a3i_token");localStorage.removeItem("a3i_role");document.cookie="a3i_token=; path=/; Max-Age=0";document.cookie="a3i_role=; path=/; Max-Age=0";window.location.assign("/login"); }
 }
 return <div className="workspace-shell">
  <a className="skip-link" href="#workspace-content">Skip to content</a>
  <aside className="workspace-sidebar">
   <a href="/" aria-label="A3i home" className="workspace-brand"><img src="/logos/a3i-dark.png" alt="A3i"/><span>Anesthesia<br/><strong>Scheduling</strong></span></a>
   <nav aria-label="Workspace sections">{TABS.map((tab,i)=><button key={tab} aria-current={activeTab===tab?"page":undefined} onClick={()=>setActiveTab(tab)}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={icons[i]}/></svg>{tab}</button>)}</nav>
   <div className="sidebar-footer"><p>{profile?.display_name || profile?.username || "Your team. Your schedule."}{profile?.title && <><br/><strong>{profile.title}</strong></>}</p><button onClick={signOut} disabled={signingOut}>{signingOut?"Signing out…":"Sign out"}<span aria-hidden="true">↗</span></button></div>
  </aside>
  <main id="workspace-content" className="workspace-main" tabIndex={-1}>
   {profile?.display_name && <div className="px-7 pt-5 text-sm text-slate-600">Welcome, <strong>{profile.display_name}</strong>{profile.title ? ` · ${profile.title}` : ""}</div>}
   {activeTab==="Schedule"?<ScheduleBoard/>:<div className="workspace-section"><p className="eyebrow">A3i workspace</p><h1 className="section-title">{activeTab === "Analytics" ? "Team workload" : activeTab === "Sites" ? "Your facilities" : "Your team"}</h1>{activeTab==="Staff"?<StaffList/>:activeTab==="Sites"?<SitesList/>:<AnalyticsPanel/>}</div>}
  </main>
 </div>;
}
