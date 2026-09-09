// POST /api/admin — the moderation queue behind a passphrase.
//
//   { action: "queue",   pass }              → every submission, newest first
//   { action: "approve", pass, id }          → publish it to the board
//   { action: "reject",  pass, id }          → keep it out of the board
//
// The passphrase is never stored here or in the repository. It is checked by
// the database: lb_admin holds a bcrypt hash in a table that the public key
// cannot read, and lb_admin_queue / lb_admin_decide are SECURITY DEFINER
// functions that verify the hash before touching a single row. A wrong
// passphrase gets the same generic 401 as a missing one, and every attempt
// costs a full bcrypt round.
//
// Requests are also CSRF-checked, so a third-party page cannot ride along on an
// admin's browser session.

const db = require("./_lib/db.js");
const { csrfOk, readBody, str } = require("./_lib/csrf.js");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DENIED = { error: "That passphrase was not accepted." };

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  if (!csrfOk(req)) {
    return res.status(403).json({ error: "Invalid or missing CSRF token. Refresh and try again." });
  }

  const body = await readBody(req);
  const action = str(body.action, 20);
  const pass = str(body.pass, 200);
  if (!pass) return res.status(401).json(DENIED);

  try {
    if (action === "queue") {
      const r = await db.rpcTry("lb_admin_queue", { p_pass: pass });
      if (!r.ok) return res.status(401).json(DENIED);
      const rows = Array.isArray(r.data) ? r.data : [];
      return res.status(200).json({
        ok: true,
        pending: rows.filter(function (x) { return x.status === "pending"; }).length,
        queue: rows,
      });
    }

    if (action === "approve" || action === "reject") {
      const id = str(body.id, 40);
      if (!UUID.test(id)) return res.status(400).json({ error: "Invalid submission id." });
      const r = await db.rpcTry("lb_admin_decide", {
        p_pass: pass,
        p_id: id,
        p_status: action === "approve" ? "approved" : "rejected",
      });
      if (!r.ok) return res.status(401).json(DENIED);
      const row = Array.isArray(r.data) ? r.data[0] : r.data;
      if (!row) return res.status(404).json({ error: "No submission with that id." });
      return res.status(200).json({
        ok: true,
        id: row.id,
        status: row.status,
        message: action === "approve" ? "Approved — it is live on the board." : "Rejected — it stays off the board.",
      });
    }

    return res.status(400).json({ error: "Unknown action." });
  } catch (e) {
    return res.status(502).json({ error: "Database unavailable. Please try again." });
  }
};
