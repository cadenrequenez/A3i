export type UserRole = "admin" | "read-only";

export function getToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem("a3i_token");
}

export function setToken(token: string) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem("a3i_token", token);
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
