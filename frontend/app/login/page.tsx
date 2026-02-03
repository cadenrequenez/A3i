"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { decodeJwt } from "../../lib/jwt";
import { setRole, setToken } from "../../lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ username, password })
      });
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
      setError((err as Error).message);
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
            required
          />
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button className="w-full rounded-lg bg-slate-900 px-4 py-2 text-white">Sign In</button>
      </form>
    </main>
  );
}
