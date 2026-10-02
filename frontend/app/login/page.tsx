"use client";

import { useEffect, useState } from "react";
import { decodeJwt } from "../../lib/jwt";
import { setRole, setToken } from "../../lib/auth";

import { API_BASE_URL, signIn } from "../../lib/connection";
import EntryShell, { EntryArrow } from "../../components/entry/EntryShell";
import styles from "../../components/entry/entry.module.css";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [slowLoginHint, setSlowLoginHint] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("session") === "expired") setError("Your session has expired. Please sign in again.");
    if (new URLSearchParams(window.location.search).get("session") === "changed") setError("Your account changed in another tab. Sign in here to continue with the correct calendar.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    fetch(`${API_BASE_URL}/`, { signal: controller.signal, cache: "no-store" })
      .catch(() => undefined).finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); controller.abort(); };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }
    setError(null);
    setIsSubmitting(true);
    setSlowLoginHint(false);
    const normalizedUsername = username.trim();
    const normalizedPassword = password;

    if (!normalizedUsername || !normalizedPassword) {
      setError("Username and password are required");
      setIsSubmitting(false);
      return;
    }

    let slowHintTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      slowHintTimer = setTimeout(() => setSlowLoginHint(true), 4000);
      const token = await signIn(normalizedUsername, normalizedPassword);
      const payload = decodeJwt(token);

      if (!payload.exp || payload.exp * 1000 <= Date.now() ||
          !["admin", "read-only"].includes(payload.role || "")) {
        throw new Error("A3i returned an invalid session. Please try signing in again.");
      }
      setToken(token);
      setRole(payload.role as "admin" | "read-only");
      const cookieOptions = `path=/; SameSite=Lax; Max-Age=${Math.floor(payload.exp - Date.now() / 1000)}${window.location.protocol === "https:" ? "; Secure" : ""}`;
      document.cookie = `a3i_token=${token}; ${cookieOptions}`;
      document.cookie = `a3i_role=${payload.role}; ${cookieOptions}`;
      window.location.replace("/");
    } catch (err) {
      const message = (err as Error).name === "AbortError"
        ? "Login timed out. Please try again in a moment."
        : (err as Error).message || "Login request failed. Check frontend API URL settings.";
      setError(message);
    } finally {
      if (slowHintTimer) {
        clearTimeout(slowHintTimer);
      }
      setSlowLoginHint(false);
      setIsSubmitting(false);
    }
  };

  return (
    <EntryShell page="signin">
      <main id="entry-content" className={styles.loginCenter}>
      <form onSubmit={handleSubmit} className={styles.form} aria-busy={isSubmitting} aria-labelledby="signin-title">
        <p className={styles.eyebrow}>Your workspace</p>
        <h1 id="signin-title">Sign in to A3i</h1>
        <p className={styles.formIntro}>Welcome to your team&apos;s workspace.</p>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            name="username"
            disabled={isSubmitting}
            aria-describedby={error ? "signin-error" : undefined}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
          />
          <label htmlFor="password">Password</label>
          <div className={styles.password}>
          <input
            id="password"
            name="password"
            disabled={isSubmitting}
            type={showPassword ? "text" : "password"}
            aria-describedby={error ? "signin-error" : undefined}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
          <button type="button" disabled={isSubmitting} onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} aria-controls="password">{showPassword ? "Hide" : "Show"}</button>
          </div>
        {error && <p id="signin-error" role="alert" className={styles.error}>{error}</p>}
        {slowLoginHint && (
          <p role="status" className={styles.status}>
            Connecting to A3i. This can take up to 90 seconds after a period of inactivity. Your sign-in is still in progress.
          </p>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className={`${styles.primary} ${styles.submit}`}
        >
          {isSubmitting ? "Signing in…" : <>Sign in<EntryArrow /></>}
        </button>
      <p className={styles.formNote}>Use your A3i username and password.</p>
      </form>
      </main>
    </EntryShell>
  );
}
