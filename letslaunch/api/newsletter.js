// POST /api/newsletter — persists a daily-digest subscription.
// CSRF-validated. Rows land in lb_subscribers, which is insert-only and has a
// unique constraint on email, so the public key can neither read the list back
// nor create duplicates.

const db = require("./_lib/db.js");
const { csrfOk, readBody, str, isEmail } = require("./_lib/csrf.js");

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
  const email = str(body.email, 160);
  if (!isEmail(email)) return res.status(400).json({ error: "Please enter a valid email address." });

  try {
    const r = await db.insert("lb_subscribers", { email: email });
    if (r.status === 409) {
      // Unique-constraint hit: already on the list. Not an error for the reader.
      return res.status(200).json({ ok: true, message: "You're already subscribed 🎉" });
    }
    if (!r.ok) return res.status(502).json({ error: "Could not save your subscription. Please try again." });
    return res.status(200).json({ ok: true, message: "Subscribed 🎉 Check your inbox tomorrow at 8am." });
  } catch (e) {
    return res.status(502).json({ error: "Database unavailable. Please try again." });
  }
};
