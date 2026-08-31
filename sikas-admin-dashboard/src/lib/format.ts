export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const secs = Math.round((Date.now() - then) / 1000);

  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function absoluteTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

/** "Mozilla/5.0 (Macintosh; …) Chrome/…" -> "Chrome on macOS" */
export function describeAgent(ua: string | null): string {
  if (!ua) return "Unknown client";

  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) && /Version\//.test(ua) ? "Safari"
    : /Firefox\//.test(ua) ? "Firefox"
    : /curl\//i.test(ua) ? "curl"
    : "Unknown browser";

  const os =
    /Windows NT/.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /Android/.test(ua) ? "Android"
    : /iPhone|iPad|iOS/.test(ua) ? "iOS"
    : /Linux/.test(ua) ? "Linux"
    : null;

  return os ? `${browser} on ${os}` : browser;
}

const ACTION_LABELS: Record<string, string> = {
  login: "Sign in",
  logout: "Sign out",
  totp_verify: "Authenticator check",
  email_otp_verify: "Email code check",
  sms_verify: "SMS code check",
  password_reset: "Password reset",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] || action.replace(/_/g, " ");
}
