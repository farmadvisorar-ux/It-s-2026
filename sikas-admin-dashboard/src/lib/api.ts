const API_URL = import.meta.env.VITE_API_URL || "http://localhost:9000";

const ACCESS_KEY = "sikas_access_token";
const REFRESH_KEY = "sikas_refresh_token";

export interface AdminUser {
  id: number;
  email: string;
  role: string;
  email_verified?: boolean;
  totp_verified?: boolean;
  sms_verified?: boolean;
  created_at?: string;
  last_login_at?: string | null;
  status?: string;
  active_sessions?: number;
}

export interface ApiError {
  error: string;
  message: string;
  status: number;
}

export class ApiRequestError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh?: string) {
    localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

async function parse(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new ApiRequestError("bad_response", "Server returned an unreadable response", res.status);
  }
}

/** Unauthenticated call — used by the login and password-reset flows. */
export async function publicRequest<T = any>(
  path: string,
  body?: unknown,
  method = "POST"
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiRequestError(
      "network_error",
      "Can't reach the server. Is the API running?",
      0
    );
  }

  const data = await parse(res);
  if (!res.ok) {
    throw new ApiRequestError(
      data.error || "unknown_error",
      data.message || "Something went wrong",
      res.status
    );
  }
  return data;
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  // Collapse concurrent 401s into a single refresh call.
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refresh = tokens.refresh;
    if (!refresh) return false;
    try {
      const data = await publicRequest<{ access_token: string }>("/v1/auth/refresh", {
        refresh_token: refresh,
      });
      tokens.set(data.access_token);
      return true;
    } catch {
      tokens.clear();
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/** Authenticated call. Transparently refreshes the access token once on 401. */
export async function apiRequest<T = any>(
  path: string,
  options: { method?: string; body?: unknown; retry?: boolean } = {}
): Promise<T> {
  const { method = "GET", body, retry = true } = options;
  const access = tokens.access;

  if (!access) throw new ApiRequestError("no_token", "Not signed in", 401);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${access}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiRequestError("network_error", "Can't reach the server.", 0);
  }

  if (res.status === 401 && retry) {
    const ok = await refreshAccessToken();
    if (ok) return apiRequest<T>(path, { method, body, retry: false });
    throw new ApiRequestError("session_expired", "Your session expired. Sign in again.", 401);
  }

  const data = await parse(res);
  if (!res.ok) {
    throw new ApiRequestError(
      data.error || "unknown_error",
      data.message || "Something went wrong",
      res.status
    );
  }
  return data;
}

// ---- Auth endpoints ----------------------------------------------------

export interface LoginResult {
  session_id: string;
  mfa_required: boolean;
  mfa_method: "totp" | "email" | "sms";
  message: string;
}

export const auth = {
  login: (email: string, password: string) =>
    publicRequest<LoginResult>("/v1/auth/login", { email, password }),

  verifyTotp: (session_id: string, code: string) =>
    publicRequest<{ access_token: string; refresh_token: string; user: AdminUser }>(
      "/v1/auth/verify-totp",
      { session_id, code }
    ),

  sendEmailOtp: (session_id: string) =>
    publicRequest<{ expires_in: number }>("/v1/auth/send-email-otp", { session_id }),

  verifyEmailOtp: (session_id: string, code: string) =>
    publicRequest<{ access_token: string; refresh_token: string; user: AdminUser }>(
      "/v1/auth/verify-email-otp",
      { session_id, code }
    ),

  requestPasswordReset: (email: string) =>
    publicRequest<{ message: string }>("/v1/auth/password-reset-request", { email }),

  me: () => apiRequest<{ user: AdminUser }>("/v1/auth/me"),

  logout: (session_id: string) =>
    publicRequest<{ message: string }>("/v1/auth/logout", { session_id }),
};

// ---- Admin endpoints ---------------------------------------------------

export interface Stats {
  active_admins: number;
  admins_with_2fa: number;
  active_sessions: number;
  events_24h: number;
  failures_24h: number;
  logins_7d: number;
}

export interface ActivityDay {
  day: string;
  successes: number;
  failures: number;
}

export interface AuditEvent {
  id: number;
  action: string;
  status: "success" | "failure";
  ip_address: string | null;
  error_msg: string | null;
  created_at: string;
  admin_email: string | null;
}

export interface SessionRow {
  id: string;
  ip_address: string | null;
  user_agent: string | null;
  is_mfa_verified: boolean;
  created_at: string;
  expires_at: string;
  last_activity_at: string;
}

export const admin = {
  stats: () => apiRequest<{ stats: Stats }>("/v1/admin/stats"),
  activity: () => apiRequest<{ activity: ActivityDay[] }>("/v1/admin/activity"),
  auditLog: (params: { limit?: number; offset?: number; status?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.limit) q.set("limit", String(params.limit));
    if (params.offset) q.set("offset", String(params.offset));
    if (params.status) q.set("status", params.status);
    const qs = q.toString();
    return apiRequest<{ total: number; events: AuditEvent[]; limit: number; offset: number }>(
      `/v1/admin/audit-log${qs ? `?${qs}` : ""}`
    );
  },
  sessions: () => apiRequest<{ sessions: SessionRow[] }>("/v1/admin/sessions"),
  revokeSession: (id: string) =>
    apiRequest<{ message: string }>(`/v1/admin/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  users: () => apiRequest<{ users: AdminUser[] }>("/v1/admin/users"),
};
