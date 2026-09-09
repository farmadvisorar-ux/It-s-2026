// Shared CSRF + body helpers for the Launchboard API functions.
// The X-CSRF-Token header must match the HttpOnly XSRF-TOKEN cookie issued by
// /api/csrf, compared in constant time.

const crypto = require("crypto");

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

function csrfOk(req) {
  const cookieToken = parseCookies(req.headers.cookie)["XSRF-TOKEN"];
  const headerToken = req.headers["x-csrf-token"];
  return !!cookieToken && !!headerToken && safeEqual(cookieToken, String(headerToken));
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

const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const isEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
const isUrl = (v) => { try { const p = new URL(v); return p.protocol === "http:" || p.protocol === "https:"; } catch (e) { return false; } };

module.exports = { parseCookies, safeEqual, csrfOk, readBody, str, isEmail, isUrl };
