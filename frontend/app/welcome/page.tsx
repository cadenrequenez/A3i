import Link from "next/link";
import EntryShell, { EntryArrow } from "../../components/entry/EntryShell";
import styles from "../../components/entry/entry.module.css";

export default function WelcomePage() {
  return (
    <EntryShell page="home">
      <main id="entry-content" className={styles.hero}>
        <p className={styles.eyebrow}><span className={styles.dot} aria-hidden="true" />The anesthesia workforce portal</p>
        <h1>Built for anesthesia.<br /><span>Designed around your team.</span></h1>
        <p className={styles.description}>One intelligent workspace for scheduling, staffing, and team coordination.</p>
        <Link href="/login" className={styles.primary}>Sign in to A3i<EntryArrow /></Link>
        <div className={styles.capabilities}><span>Scheduling</span><b aria-hidden="true">·</b><span>Staffing</span><b aria-hidden="true">·</b><span>Team coordination</span></div>
      </main>
    </EntryShell>
  );
}
