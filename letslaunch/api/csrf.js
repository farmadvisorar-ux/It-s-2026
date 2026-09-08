// GET /api/csrf
// Issues a CSRF token and sets it in a hardened cookie.
//
// CommonJS on purpose: this api/ folder ships its own package.json with
// "type": "commonjs" so these functions load as CommonJS even though the repo
// root package.json declares "type": "module".
//
// Fixes the two cookie findings from the scan:
//   - "XSRF-TOKEN is missing the HttpOnly flag" (High)
//   - "XSRF-TOKEN is missing the SameSite attribute" (Low)
// The token is also returned in the JSON body and validated server-side against
// the cookie (synchronizer-token pattern), so the cookie stays HttpOnly without
// breaking the form.

const crypto = require("crypto");

module.exports = function handler(req, res) {
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
};
