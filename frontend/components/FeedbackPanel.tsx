"use client";

import { FormEvent, useEffect, useState } from "react";
import { fetchApi, fetchProfile } from "../lib/api";

type Report = { id: number; owner_id: number; category: string; description: string; expected_behavior: string; page_context: string; urgency: string; status: string; created_at: string };
const statuses = ["received", "reviewing", "testing", "resolved"];
const field = "w-full rounded-lg border border-slate-300 bg-white p-3";

export default function FeedbackPanel() {
  const [reports, setReports] = useState<Report[]>([]);
  const [admin, setAdmin] = useState(false);
  const [inbox, setInbox] = useState(false);
  const [offset, setOffset] = useState(0);
  const [context, setContext] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const token = () => localStorage.getItem("a3i_token") || "";
  async function request(path: string, init?: RequestInit) {
    const response = await fetchApi(`/api/v1/feedback${path}`, { ...init, cache: "no-store", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` } });
    if (!response.ok) throw new Error("Unable to save or load requests. Please try again.");
    return response.json();
  }
  async function load(showInbox: boolean, start: number) {
    setLoading(true);
    try { setReports(await request(`?inbox=${showInbox}&offset=${start}`)); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    const from = new URLSearchParams(window.location.search).get("from") || "/";
    setContext(from.startsWith("/") ? from.split(/[?#]/)[0].slice(0, 300) : "/");
    fetchProfile(token()).then(profile => setAdmin(profile.role === "admin")).catch(e => setError(e.message));
  }, []);
  useEffect(() => { load(inbox, offset).catch(e => setError(e.message)); }, [inbox, offset]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setError(""); setNotice("");
    try {
      const report = await request("", { method: "POST", body: JSON.stringify({ category: data.get("category"), description: data.get("description"), expected_behavior: data.get("expected_behavior"), page_context: context, urgency: data.get("urgency") }) });
      form.reset(); setNotice(`Request #${report.id} received. You can follow its status below.`);
      await load(inbox, offset);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function update(id: number, status: string) {
    setBusy(true); setError("");
    try { await request(`/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }); await load(inbox, offset); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <section aria-label="Feedback requests" className="mx-auto max-w-4xl space-y-6 px-6 py-8">
    <h1 className="text-3xl font-semibold">Report or suggest a change</h1>
    <p>Send a bug, fix, feature idea, or schedule correction for administrator review. Requests do not change a schedule automatically.</p>
    <p className="rounded-lg bg-amber-50 p-4">Exclude patient information and other sensitive details. Text only; screenshots are not supported. High urgency flags the inbox but does not send an immediate alert.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {notice && <p role="status" className="text-green-800">{notice}</p>}
    <form onSubmit={submit} className="surface-card space-y-4 rounded-2xl p-6">
      <label className="block">Category<select name="category" className={field}><option value="bug">Bug report</option><option value="fix">Request a fix</option><option value="feature">Feature suggestion</option><option value="schedule_correction">Schedule correction</option></select></label>
      <label className="block">Description<textarea name="description" required minLength={1} maxLength={4000} rows={4} className={field} /></label>
      <label className="block">Expected behavior (optional)<textarea name="expected_behavior" maxLength={4000} rows={3} className={field} /></label>
      <label className="block">Page context<input value={context} onChange={e => setContext(e.target.value)} maxLength={300} pattern="/[^?#]*" className={field} /><span className="text-sm text-slate-600">Page path only. Add the relevant month or date to the description.</span></label>
      <label className="block">Urgency<select name="urgency" className={field}><option value="normal">Normal</option><option value="high">High</option></select></label>
      <button disabled={busy} className="rounded-full bg-sky-900 px-5 py-3 text-white disabled:opacity-50">{busy ? "Saving…" : "Send request"}</button>
    </form>
    <section className="space-y-4" aria-label="Requests">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">{inbox ? "Administrator inbox" : "My requests"}</h2><div className="flex gap-4">{admin && <button onClick={() => { setInbox(!inbox); setOffset(0); setError(""); }}>{inbox ? "My requests" : "Open administrator inbox"}</button>}<button disabled={loading || busy} onClick={() => { setError(""); load(inbox, offset).catch(e => setError(e.message)); }}>Refresh</button></div></div>
      <p className="text-sm text-slate-600">Received → Reviewing → Testing → Resolved. Administrators review reports here; email and external alerts are not configured.</p>
      {loading ? <p role="status">Loading requests…</p> : !reports.length ? <p>No requests on this page.</p> : reports.map(report => <article key={report.id} className="surface-card space-y-3 rounded-xl p-5">
        <h3 className="font-semibold">#{report.id} · {report.category.replaceAll("_", " ")} · {report.urgency}</h3>
        <p className="text-sm">{new Date(report.created_at).toLocaleString()}{inbox ? ` · Account #${report.owner_id}` : ""}</p>
        <p className="whitespace-pre-wrap break-words">{report.description}</p>
        {report.expected_behavior && <p className="whitespace-pre-wrap break-words">Expected: {report.expected_behavior}</p>}
        <p className="break-words text-sm">Page: {report.page_context || "Not specified"}</p>
        {admin && inbox ? <label>Status<select aria-label={`Status for request ${report.id}`} value={report.status} disabled={busy} onChange={e => update(report.id, e.target.value)} className={field}>{statuses.map(status => <option key={status}>{status}</option>)}</select></label> : <p className="font-semibold">Status: {report.status}</p>}
      </article>)}
      <div className="flex gap-5"><button disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</button><button disabled={loading || reports.length < 50} onClick={() => setOffset(offset + 50)}>Next</button></div>
    </section>
  </section>;
}
