// POST /api/newsletter
// Subscribes an email to the daily digest. CSRF-validated: the X-CSRF-Token
// header must match the HttpOnly XSRF-TOKEN cookie from /api/csrf (constant-time
// compare). ESM module (repo is "type": "module"). Demo — does not persist.

import crypto from "crypto";

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(";").forEach(function (part) {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise(function (resolve) {
    let data = "";
    req.on("data", function (c) { data += c; if (data.length > 1e6) req.destroy(); });
    req.on("end", function () { try { resolve(JSON.parse(data || "{}")); } catch (e) { resolve({}); } });
    req.on("error", function () { resolve({}); });
  });
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies["XSRF-TOKEN"];
  const headerToken = req.headers["x-csrf-token"];
  if (!cookieToken || !headerToken || !safeEqual(cookieToken, String(headerToken))) {
    return res.status(403).json({ error: "Invalid or missing CSRF token. Refresh and try again." });
  }

  const body = await readBody(req);
  const email = String(body.email || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }

  return res.status(200).json({ ok: true, message: "You're subscribed 🎉 Check your inbox tomorrow at 8am." });
}
