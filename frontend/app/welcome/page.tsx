export default function WelcomePage() {
  return (
    <main className="mx-auto flex min-h-[80vh] max-w-5xl flex-col items-center justify-center gap-8 px-6 text-center text-white">
      <section className="w-full rounded-3xl bg-slate-950 px-8 py-12 shadow-xl">
        <div className="space-y-4">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-400">
            Artificial Anesthesia Administrative Intelligence
          </p>
          <h1 className="text-4xl font-bold md:text-5xl">
            Automate and optimize anesthesia scheduling with A3i.
          </h1>
          <p className="text-base text-slate-300 md:text-lg">
            A3i is an AI-driven platform that takes the complexity out of physician and CRNA scheduling,
            ensuring compliant coverage, fair call rotations, and real-time visibility across all your facilities.
          </p>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href="/login"
            className="rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-900"
          >
            Get started
          </a>
          <a
            href="/login"
            className="rounded-full border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-200"
          >
            Request a demo
          </a>
        </div>
        <p className="mt-4 text-xs text-slate-400">
          Turning complex scheduling into a simple click.
        </p>
      </section>

      <section className="grid w-full gap-4 text-left md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 text-slate-200">
          <h3 className="text-sm font-semibold">What A3i solves</h3>
          <p className="mt-2 text-sm text-slate-400">
            Manual spreadsheets and fragmented calls make anesthesia scheduling error-prone and exhausting.
            A3i centralizes rules, staffing, and coverage so your teams stay aligned.
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 text-slate-200">
          <h3 className="text-sm font-semibold">Why it’s better</h3>
          <p className="mt-2 text-sm text-slate-400">
            Automated monthly schedules, drag-and-drop adjustments, and real-time visibility let admins
            respond quickly while maintaining compliance.
          </p>
        </div>
      </section>

      <section className="grid w-full gap-4 md:grid-cols-4">
        {[
          "Automated monthly schedule generation with built-in rules",
          "Drag-and-drop adjustments for last-minute changes",
          "Real-time dashboard showing coverage and call status",
          "Predictive analytics to flag shortages and optimize staffing"
        ].map((item) => (
          <div key={item} className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 text-left text-sm text-slate-300">
            {item}
          </div>
        ))}
      </section>
    </main>
  );
}
