"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { decodeJwt } from "../../lib/jwt";
import { setRole, setToken } from "../../lib/auth";

import { API_BASE_URL, signIn } from "../../lib/connection";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [slowLoginHint, setSlowLoginHint] = useState(false);

  useEffect(() => {
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
      router.replace("/");
      router.refresh();
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
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4 rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Sign in to A3i</h1>
        <div className="space-y-2">
          <label htmlFor="username" className="text-sm font-medium">Username</label>
          <input
            id="username"
            name="username"
            disabled={isSubmitting}
            className="w-full rounded-lg border border-slate-200 px-3 py-2"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            required
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">Password</label>
          <input
            id="password"
            name="password"
            disabled={isSubmitting}
            type="password"
            className="w-full rounded-lg border border-slate-200 px-3 py-2"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        {slowLoginHint && (
          <p role="status" className="text-sm text-slate-600">
            Connecting to A3i. This can take up to 90 seconds after a period of inactivity. Your sign-in is still in progress.
          </p>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-slate-900 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </main>
  );
}
