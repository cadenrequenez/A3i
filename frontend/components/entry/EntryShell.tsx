import type { ReactNode } from "react";
import Link from "next/link";
import styles from "./entry.module.css";

export function EntryArrow({ direction = "right" }: { direction?: "right" | "left" | "up-right" }) {
  const path = direction === "left" ? "M19 12H5m7-7-7 7 7 7" : direction === "up-right" ? "M7 17 17 7M7 7h10v10" : "M5 12h14m-7-7 7 7-7 7";
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>;
}

export default function EntryShell({ children, page }: { children: ReactNode; page: "home" | "signin" }) {
  return (
    <div className={styles.entry}>
      <a href="#entry-content" className={styles.skipLink}>Skip to content</a>
      <header className={styles.header}>
        <Link href="/welcome" className={styles.identity} aria-label="A3i home">
          <span className={styles.brand}>
            <img src="/logos/a3i-navy.png" alt="A3i" width="840" height="472" />
          </span>
          <span className={styles.fullName}>Anesthesia Administration<br />&amp; Artificial Intelligence</span>
        </Link>
        <Link href={page === "home" ? "/login" : "/welcome"} className={styles.headerLink}>
          {page === "signin" && <EntryArrow direction="left" />}
          {page === "home" ? "Sign in" : "Back to home"}
          {page === "home" && <EntryArrow direction="up-right" />}
        </Link>
      </header>
      {children}
      <footer className={styles.footer}><span>A3i</span><span>Your workforce. Connected.</span></footer>
    </div>
  );
}
