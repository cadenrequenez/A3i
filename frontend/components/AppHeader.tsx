"use client";

import { usePathname } from "next/navigation";

export default function AppHeader() {
  const pathname = usePathname();
  const isWelcome = pathname === "/welcome";
  const logoSrc = isWelcome ? "/logos/a3i-dark.png" : "/logos/a3i-light.png";

  return (
    <header className={`flex items-center justify-between px-6 py-4 ${isWelcome ? "bg-slate-950" : "bg-transparent"}`}>
      <a href={isWelcome ? "/welcome" : "/"} className="flex items-center gap-2">
        <img src={logoSrc} alt="A3i logo" className="h-10 w-auto" />
      </a>
      <a
        href={isWelcome ? "/login" : "/welcome"}
        className={`rounded-full border px-3 py-1 text-sm ${
          isWelcome
            ? "border-slate-700 text-slate-200"
            : "border-slate-200 text-slate-600"
        }`}
      >
        {isWelcome ? "Sign In" : "Welcome"}
      </a>
    </header>
  );
}
