export type JwtPayload = {
  sub?: string;
  role?: string;
  exp?: number;
};

export function decodeJwt(token: string): JwtPayload {
  const [, payload] = token.split(".");
  if (!payload) {
    return {};
  }
  try {
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return decoded;
  } catch {
    return {};
  }
}
