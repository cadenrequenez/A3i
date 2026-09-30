export type UserRole = "admin" | "read-only";

let initialToken: string | undefined;
let sessionInitialized = false;

export function getToken(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const token = window.localStorage.getItem("a3i_token") ?? undefined;
  if (sessionInitialized && token !== initialToken) {
    window.location.replace("/login?session=changed");
    throw new Error("Your account changed in another tab. Sign in again before editing.");
  }
  initialToken = token;
  sessionInitialized = true;
  return token;
}

export function setToken(token: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem("a3i_token", token);
  initialToken = token;
  sessionInitialized = true;
}

export function getRole(): UserRole {
  if (typeof window === "undefined") {
    return "read-only";
  }

  return (window.localStorage.getItem("a3i_role") as UserRole) || "read-only";
}

export function setRole(role: UserRole) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem("a3i_role", role);
}
// Recheck on storage changes and when a suspended/back-navigation page returns.
export function watchAccountSession(): () => void {
  if (typeof window === "undefined") return () => {};
  getToken();
  const check = () => { try { getToken(); } catch { /* getToken redirects and blocks stale saves. */ } };
  const changed = (event: StorageEvent) => { if (event.key === "a3i_token" || event.key === null) check(); };
  window.addEventListener("storage", changed);
  window.addEventListener("pageshow", check);
  window.addEventListener("focus", check);
  return () => {
    window.removeEventListener("storage", changed);
    window.removeEventListener("pageshow", check);
    window.removeEventListener("focus", check);
  };
}
