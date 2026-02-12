"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { decodeJwt } from "../../lib/jwt";
import { setRole, setToken } from "../../lib/auth";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [slowLoginHint, setSlowLoginHint] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/`, { method: "GET" }).catch(() => undefined);
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
    const normalizedPassword = password.trim();

    if (!normalizedUsername || !normalizedPassword) {
      setError("Username and password are required");
      setIsSubmitting(false);
      return;
    }

    let slowHintTimer: ReturnType<typeof setTimeout> | undefined;
    let abortTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const controller = new AbortController();
      slowHintTimer = setTimeout(() => setSlowLoginHint(true), 4000);
      abortTimer = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ username: normalizedUsername, password: normalizedPassword }),
        signal: controller.signal
      });
      clearTimeout(slowHintTimer);
      clearTimeout(abortTimer);
      if (!response.ok) {
        throw new Error("Invalid credentials");
      }
      const data = await response.json();
      const token = data.access_token as string;
      const payload = decodeJwt(token);

      setToken(token);
      if (payload.role) {
        setRole(payload.role as "admin" | "read-only");
      }
      document.cookie = `a3i_token=${token}; path=/`;
      document.cookie = `a3i_role=${payload.role || "read-only"}; path=/`;
      router.push("/");
    } catch (err) {
      const message = (err as Error).name === "AbortError"
        ? "Login timed out. Please try again in a moment."
        : (err as Error).message || "Load failed";
      setError(message);
    } finally {
      if (slowHintTimer) {
        clearTimeout(slowHintTimer);
      }
      if (abortTimer) {
        clearTimeout(abortTimer);
      }
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4 rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Sign in to A3i</h1>
        <div className="space-y-2">
          <label className="text-sm font-medium">Username</label>
          <input
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
          <label className="text-sm font-medium">Password</label>
          <input
            type="password"
            className="w-full rounded-lg border border-slate-200 px-3 py-2"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {slowLoginHint && (
          <p className="text-sm text-slate-600">
            Sign in is taking longer than usual. Backend may be waking up, please wait a few seconds.
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
