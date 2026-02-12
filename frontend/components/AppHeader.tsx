"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

export default function AppHeader() {
  const pathname = usePathname();
  const isWelcome = pathname === "/welcome";
  const logoSrc = isWelcome ? "/logos/a3i-light.png" : "/logos/a3i-dark.png";
  const [logoVisible, setLogoVisible] = useState(true);

  return (
    <header className="mx-auto w-full max-w-6xl px-6 pb-4 pt-6">
      <div className={`surface-card flex items-center justify-between rounded-2xl px-5 py-3 ${isWelcome ? "bg-slate-950 text-white" : ""}`}>
        <a href={isWelcome ? "/welcome" : "/"} className="flex items-center gap-3">
          {logoVisible ? (
            <img
              src={logoSrc}
              alt="A3i logo"
              className="h-10 w-auto"
              onError={() => setLogoVisible(false)}
            />
          ) : (
            <div className="rounded-lg bg-sky-900 px-3 py-1 text-sm font-semibold text-white">A3i</div>
          )}
          <div className="leading-tight">
            <p className={`text-xs uppercase tracking-[0.22em] ${isWelcome ? "text-slate-300" : "text-slate-500"}`}>A3i</p>
            <p className="text-sm font-semibold">Anesthesia Scheduler</p>
          </div>
        </a>
        <a
          href={isWelcome ? "/login" : "/welcome"}
          className={`rounded-full border px-4 py-1.5 text-sm ${
            isWelcome
              ? "border-white/30 bg-white text-slate-900"
              : "border-slate-300 bg-white/80 text-slate-700"
          }`}
        >
          {isWelcome ? "Sign In" : "Welcome"}
        </a>
      </div>
      <a href={isWelcome ? "/welcome" : "/"} className="sr-only">
        Home
      </a>
    </header>
  );
}
