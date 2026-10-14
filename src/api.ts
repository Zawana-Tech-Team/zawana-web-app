import type { User } from "./types";

export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

let token =
  typeof localStorage === "undefined" ? "" : localStorage.getItem("zawana_access_token") || "";

export function setToken(value: string | null) {
  token = value || "";
  if (typeof localStorage !== "undefined") {
    if (token) localStorage.setItem("zawana_access_token", token);
    else localStorage.removeItem("zawana_access_token");
  }
}

export function getToken() {
  return token;
}

let refreshFlight: Promise<void> | null = null;

async function refreshSession() {
  if (!refreshFlight) {
    refreshFlight = (async () => {
      const result = await api<AuthResponse>('/auth/refresh', {
        method: 'POST',
        body: '{}'
      });
      setToken(result.accessToken || result.token);
    })().finally(() => { refreshFlight = null; });
  }
  await refreshFlight;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) headers.set("Content-Type", "application/json");
  const sentToken = token;
  const explicitAuthorization = headers.has('Authorization');
  if (sentToken && !explicitAuthorization) headers.set("Authorization", `Bearer ${sentToken}`);
  let response = await fetch(`${API_BASE_URL}${path}`, { credentials: 'include', ...options, headers });
  if (response.status === 401 && sentToken && !explicitAuthorization && (!path.startsWith('/auth/') || path === '/auth/me' || path === '/auth/mfa/status')) {
    // Concurrent requests share one rotation; a late 401 uses the already refreshed token.
    if (token === sentToken) await refreshSession();
    headers.set('Authorization', `Bearer ${token}`);
    response = await fetch(`${API_BASE_URL}${path}`, { credentials: 'include', ...options, headers });
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.message || `Request failed (${response.status})`;
    const error = new Error(
      data?.requestId ? `${message} (Reference: ${data.requestId})` : message
    ) as Error & { status?: number; details?: any; code?: string; requestId?: string };
    error.status = response.status;
    error.details = data;
    error.code = data?.code;
    error.requestId = data?.requestId;
    throw error;
  }
  return data as T;
}

export const get = <T,>(path: string) => api<T>(path);
export const post = <T,>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });
export const patch = <T,>(path: string, body: unknown) =>
  api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
export const put = <T,>(path: string, body: unknown) =>
  api<T>(path, { method: "PUT", body: JSON.stringify(body) });
export const del = (path: string, body?: unknown) =>
  api<void>(path, {
    method: "DELETE",
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });

export type AuthResponse = { user: User; accessToken: string; token: string };
