// POST /api/submit — persists a startup submission to the database.
// CSRF-validated (X-CSRF-Token must match the HttpOnly XSRF-TOKEN cookie).
// Rows land in lb_submissions, which is insert-only: nothing can read the
// submitted email addresses back out through the public key.

const db = require("./_lib/db.js");
const { csrfOk, readBody, str, isEmail, isUrl } = require("./_lib/csrf.js");

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  if (!csrfOk(req)) {
    return res.status(403).json({ error: "Invalid or missing CSRF token. Refresh and try again." });
  }

  const body = await readBody(req);
  const name = str(body.name, 60);
  const url = str(body.url, 300);
  const tagline = str(body.tagline, 120);
  const category = str(body.category, 60);
  const email = str(body.email, 160);

  if (!name || !tagline || !category) return res.status(400).json({ error: "Name, pitch and category are required." });
  if (!isUrl(url)) return res.status(400).json({ error: "Please provide a valid http(s) URL." });
  if (!isEmail(email)) return res.status(400).json({ error: "Please provide a valid email address." });

  try {
    const r = await db.insert("lb_submissions", {
      name: name, url: url, tagline: tagline, category: category, email: email,
    });
    if (!r.ok) return res.status(502).json({ error: "Could not save your submission. Please try again." });
    return res.status(200).json({
      ok: true,
      message: "Saved 🚀 Your startup is in the review queue — we'll email you when it goes live.",
      received: { name: name, category: category },
    });
  } catch (e) {
    return res.status(502).json({ error: "Database unavailable. Please try again." });
  }
};
