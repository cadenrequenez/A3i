"use client";
import { useEffect, useState } from "react";
import ScheduleWorkspace from "../components/ScheduleWorkspace";
import StaffList from "../components/StaffList";
import SitesList from "../components/SitesList";
import AnalyticsPanel from "../components/AnalyticsPanel";
import { getToken, watchAccountSession } from "../lib/auth";
import { API_BASE_URL } from "../lib/connection";
import { fetchProfile, type AccountProfile } from "../lib/api";
const TABS = ["Schedule", "Staff", "Sites", "Analytics"] as const;
const icons = ["M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z", "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8m8 .13a4 4 0 0 1 0 7.75", "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6", "M4 19V9m8 10V4m8 15v-7M2 22h20"];
export default function DashboardPage() {
 useEffect(() => watchAccountSession(), []);
 const [activeTab,setActiveTab]=useState<(typeof TABS)[number]>("Schedule");
 const [profile,setProfile]=useState<AccountProfile|null>(null);
 useEffect(()=>{fetchProfile(getToken()).then(setProfile).catch(()=>{});},[]);
 const [signingOut,setSigningOut]=useState(false);
 async function signOut(){
  let token: string | undefined;
  try { token = getToken(); } catch { return; }
  setSigningOut(true);
  try { await fetch(`${API_BASE_URL}/api/v1/auth/logout`,{method:"POST",headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(5000)}); } catch {}
  finally { localStorage.removeItem("a3i_token");localStorage.removeItem("a3i_role");document.cookie="a3i_token=; path=/; Max-Age=0";document.cookie="a3i_role=; path=/; Max-Age=0";window.location.assign("/login"); }
 }
 return <div className="workspace-shell">
  <a className="skip-link" href="#workspace-content">Skip to content</a>
  <aside className="workspace-sidebar">
   <a href="/" aria-label="A3i home" className="workspace-brand"><img src="/logos/a3i-navy.png" alt="A3i"/></a>
   <nav aria-label="Workspace sections">{TABS.map((tab,i)=><button key={tab} aria-current={activeTab===tab?"page":undefined} onClick={()=>setActiveTab(tab)}><svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={icons[i]}/></svg>{tab === "Staff" ? "Team" : tab === "Sites" ? "Facilities" : tab}</button>)}</nav>
   <div className="sidebar-footer"><button onClick={signOut} disabled={signingOut}><span aria-hidden="true">↗</span>{signingOut?"Signing out…":"Sign out"}</button></div>
  </aside>
  <main id="workspace-content" className="workspace-main" tabIndex={-1}>
   <header className="workspace-masthead"><div><p className="masthead-kicker">Your scheduling workspace</p><p className="workspace-owner">{profile?.display_name || profile?.username || "Welcome to A3i"}{profile?.title && <span>{profile.title}</span>}</p></div><span className="workspace-privacy"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg> Your private workspace</span></header>
   <div hidden={activeTab!=="Schedule"}><ScheduleWorkspace accountKey={profile?.username}/></div>
   {activeTab!=="Schedule"&&<div className="workspace-section"><p className="eyebrow">A3i workspace</p><h1 className="section-title">{activeTab === "Analytics" ? "Team workload" : activeTab === "Sites" ? "Your facilities" : "Your team"}</h1>{activeTab==="Staff"?<StaffList/>:activeTab==="Sites"?<SitesList/>:<AnalyticsPanel/>}</div>}
  </main>
 </div>;
}
