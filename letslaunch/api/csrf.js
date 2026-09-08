// GET /api/csrf
// Issues a CSRF token and sets it in a hardened cookie (ESM — the repo root
// package.json declares "type": "module", so functions must be ES modules).
//
// Fixes the two cookie findings from the scan:
//   - "XSRF-TOKEN is missing the HttpOnly flag" (High)
//   - "XSRF-TOKEN is missing the SameSite attribute" (Low)
//
// The cookie is set HttpOnly + Secure + SameSite=Strict. The token is also
// returned in the JSON body and validated server-side against the cookie
// (synchronizer-token pattern), so the cookie can stay HttpOnly without
// breaking the form — both findings closed, no functionality lost.

import crypto from "crypto";

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const token = crypto.randomBytes(32).toString("hex");
  const twoHours = 60 * 60 * 2;

  res.setHeader("Set-Cookie", [
    `XSRF-TOKEN=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${twoHours}`,
    `lb_session=${crypto.randomBytes(24).toString("hex")}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${twoHours}`,
  ]);

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(200).json({ csrfToken: token });
}
