import { storage } from "@/src/utils/storage";

const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;
export const TOKEN_KEY = "boostbac_token";

let inMemoryToken: string | null = null;

export async function setToken(token: string | null) {
  inMemoryToken = token;
  if (token) await storage.secureSet(TOKEN_KEY, token);
  else await storage.secureRemove(TOKEN_KEY);
}

export async function getToken(): Promise<string | null> {
  if (inMemoryToken) return inMemoryToken;
  const t = await storage.secureGet<string>(TOKEN_KEY, "");
  inMemoryToken = t || null;
  return inMemoryToken;
}

type Options = {
  method?: string;
  body?: any;
  auth?: boolean;
  timeout?: number;
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Backend error messages are always in English (developer-facing detail strings).
// Never show them to the user directly — map the status code to a localized
// string instead. Callers can special-case a status for a more specific
// message (e.g. 401 on login = wrong password, 401 elsewhere = session expired).
export function localizeError(e: unknown, t: (key: string) => string): string {
  if (e instanceof ApiError) {
    if (e.status === 0) return t("offline");
    if (e.status === 408) return t("errorTimeout");
  }
  return t("errorGeneric");
}

export async function api<T = any>(path: string, opts: Options = {}): Promise<T> {
  const { method = "GET", body, auth = true, timeout = 60000 } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const detail = (data && (data.detail || data.message)) || `Request failed (${res.status})`;
      throw new ApiError(res.status, typeof detail === "string" ? detail : JSON.stringify(detail));
    }
    return data as T;
  } catch (e: any) {
    clearTimeout(timer);
    if (e instanceof ApiError) throw e;
    if (e.name === "AbortError") throw new ApiError(408, "Request timed out");
    throw new ApiError(0, e?.message || "Network error");
  }
}
