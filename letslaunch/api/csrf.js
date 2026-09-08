// GET /api/csrf
// Issues a CSRF token and sets it in a hardened cookie.
//
// This endpoint is the concrete fix for the two cookie findings from the scan:
//   - "XSRF-TOKEN is missing the HttpOnly flag" (High)
//   - "XSRF-TOKEN is missing the SameSite attribute" (Low)
//
// The cookie is set with HttpOnly + Secure + SameSite=Strict. Because a
// double-submit token normally has to be readable by JavaScript, we instead
// return the token value in the JSON body and validate it against the cookie
// server-side (synchronizer-token pattern). That lets the cookie stay HttpOnly
// while the form still works — both findings closed, no functionality lost.

const crypto = require("crypto");

module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const token = crypto.randomBytes(32).toString("hex");
  const twoHours = 60 * 60 * 2;

  res.setHeader("Set-Cookie", [
    // The CSRF cookie the scan flagged — now fully hardened.
    `XSRF-TOKEN=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${twoHours}`,
    // A separate session cookie, hardened the same way.
    `lb_session=${crypto.randomBytes(24).toString("hex")}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${twoHours}`,
  ]);

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(200).json({ csrfToken: token });
};
