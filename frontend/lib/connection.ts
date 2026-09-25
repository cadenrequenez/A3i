// Authentication and scheduling must always use the same backend.
export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "https://a3i-backend.onrender.com")
  .trim().replace(/\/+$/, "") || "https://a3i-backend.onrender.com";

export async function signIn(username: string, password: string): Promise<string> {
  const controller = new AbortController();
  // Allow the hosting service to start after inactivity.
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username: username.trim(), password }),
      signal: controller.signal,
      cache: "no-store"
    });
    if (response.status === 401) {
      throw new Error("The username or password is incorrect. Please try again.");
    }
    if (response.status === 429) {
      throw new Error("Too many sign-in attempts. Please wait a moment and try again.");
    }
    if (!response.ok) {
      throw new Error("A3i’s sign-in service is unavailable. Please try again shortly.");
    }
    const data = await response.json().catch(() => null);
    if (typeof data?.access_token !== "string" || !data.access_token) {
      throw new Error("A3i could not complete sign-in. Please try again shortly.");
    }
    return data.access_token;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("A3i could not connect within 90 seconds. Please try again. If this continues, the service needs attention.");
    }
    if (error instanceof TypeError) {
      throw new Error("Unable to connect to A3i. Check your internet connection and try again.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
