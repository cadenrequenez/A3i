export type UserRole = "admin" | "read-only";

export function getToken(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const token = window.localStorage.getItem("a3i_token");
  return token ?? undefined;
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