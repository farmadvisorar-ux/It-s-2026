// GET /api/autofill?url=https://example.com
//
// Reads a submitted product URL and derives listing information from it:
// name, tagline, description, and inferred category / tags / platforms /
// audiences. The browser never fetches the third-party site itself, so the
// page's strict CSP (connect-src 'self') stays intact.
//
// This endpoint fetches a URL supplied by the visitor, so it is guarded against
// SSRF: only http(s), the hostname is resolved first and every resolved address
// must be public, redirects are not followed, and the response is capped and
// timed out. Only extracted fields are returned — never the raw page.

const dns = require("dns").promises;
const net = require("net");

const TIMEOUT_MS = 6000;
const MAX_BYTES = 300 * 1024;

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const p = ip.split(".").map(Number);
    if (p[0] === 10) return true;
    if (p[0] === 127) return true;
    if (p[0] === 0) return true;
    if (p[0] === 169 && p[1] === 254) return true;          // link-local / cloud metadata
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
    if (p[0] >= 224) return true;                            // multicast / reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const a = ip.toLowerCase();
    if (a === "::1" || a === "::") return true;
    if (a.startsWith("fe80") || a.startsWith("fc") || a.startsWith("fd")) return true;
    if (a.startsWith("::ffff:")) return isPrivateIp(a.slice(7));
    return false;
  }
  return true;
}

async function assertPublicHost(hostname) {
  const bad = /^(localhost|.*\.local|.*\.internal|metadata\..*)$/i;
  if (bad.test(hostname)) throw new Error("blocked host");
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("blocked address");
    return;
  }
  const addrs = await dns.lookup(hostname, { all: true });
  if (!addrs.length) throw new Error("unresolvable");
  addrs.forEach(function (a) { if (isPrivateIp(a.address)) throw new Error("blocked address"); });
}

async function fetchHtml(url) {
  const ctl = new AbortController();
  const timer = setTimeout(function () { ctl.abort(); }, TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "manual",
      signal: ctl.signal,
      headers: { "User-Agent": "LaunchboardBot/1.0 (+listing autofill)", Accept: "text/html,application/xhtml+xml" },
    });
    const type = res.headers.get("content-type") || "";
    if (!res.ok || type.indexOf("html") === -1) return "";
    const buf = await res.arrayBuffer();
    return Buffer.from(buf.slice(0, MAX_BYTES)).toString("utf8");
  } finally {
    clearTimeout(timer);
  }
}

/* ---- extraction ---- */
const decode = (s) => String(s || "")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ").trim();

function meta(html, names) {
  for (const n of names) {
    const re = new RegExp('<meta[^>]+(?:property|name)\\s*=\\s*["\']' + n + '["\'][^>]*>', "i");
    const tag = (html.match(re) || [])[0];
    if (tag) {
      const c = tag.match(/content\s*=\s*["']([^"']*)["']/i);
      if (c && c[1].trim()) return decode(c[1]);
    }
  }
  return "";
}

/* ---- inference ---- */
const CATEGORIES = [
  ["AI Assistant", ["ai assistant", "copilot", "chatbot", "agent", "gpt", "llm"]],
  ["Image Generation", ["image", "photo", "design generat", "render", "avatar", "logo"]],
  ["Developer Tools", ["developer", "api", "sdk", "code", "git", "deploy", "ci/cd", "debug"]],
  ["Analytics", ["analytics", "metrics", "dashboard", "insight", "tracking", "telemetry"]],
  ["Marketing Analytics", ["attribution", "campaign", "roas", "marketing analytics"]],
  ["Lead Generation", ["leads", "outbound", "prospect", "cold email", "crm"]],
  ["Content Marketing", ["content", "blog", "copywriting", "newsletter", "social media"]],
  ["Habit Tracking", ["habit", "streak", "routine", "wellness"]],
  ["Productivity", ["productivity", "notes", "task", "todo", "focus", "workflow"]],
  ["SaaS", ["saas", "platform", "software", "subscription", "billing"]],
];
const PLATFORMS = [
  ["iOS", ["ios", "iphone", "app store", "apple"]], ["Android", ["android", "google play"]],
  ["Chrome Extension", ["chrome extension", "browser extension", "add-on"]],
  ["Self-hosted", ["self-host", "self hosted", "docker", "open source", "on-premise"]],
  ["API", ["api", "rest", "graphql", "webhook"]], ["MCP", ["mcp", "model context protocol"]],
  ["Desktop", ["desktop", "macos", "windows app", "electron"]],
];
const AUDIENCES = [
  ["Developers", ["developer", "engineer", "programmer", "devops"]],
  ["Marketers", ["marketer", "marketing team", "growth"]],
  ["Designers", ["designer", "design team", "creative"]],
  ["Founders", ["founder", "indie", "solo", "startup owner"]],
  ["Startups", ["startup", "early-stage", "saas team"]],
  ["Sales Teams", ["sales", "revenue team", "sdr"]],
  ["Content Creators", ["creator", "youtuber", "influencer", "podcaster"]],
  ["Students", ["student", "study", "learn", "course"]],
  ["Remote Workers", ["remote", "distributed team", "async"]],
  ["Agencies", ["agency", "agencies", "client work"]],
];
function match(list, text, limit) {
  const out = [];
  list.forEach(function (row) {
    if (out.length >= limit) return;
    if (row[1].some(function (k) { return text.indexOf(k) !== -1; })) out.push(row[0]);
  });
  return out;
}
function keywords(text, limit) {
  const stop = new Set(("the a an and or for with your you our we to of in on is are it that this best free new all can get make more your platform".split(" ")));
  const freq = {};
  (text.match(/[a-z][a-z+#.-]{2,18}/g) || []).forEach(function (w) {
    if (stop.has(w) || w.length < 4) return;
    freq[w] = (freq[w] || 0) + 1;
  });
  return Object.keys(freq).sort(function (a, b) { return freq[b] - freq[a]; }).slice(0, limit)
    .map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); });
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const q = req.query || {};
  const raw = String((Array.isArray(q.url) ? q.url[0] : q.url) || "").trim().slice(0, 300);
  if (!raw) return res.status(400).json({ error: "Provide a ?url= to read." });

  let target;
  try {
    target = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
    if (target.protocol !== "http:" && target.protocol !== "https:") throw new Error("scheme");
  } catch (e) {
    return res.status(400).json({ error: "That does not look like a valid URL." });
  }

  try {
    await assertPublicHost(target.hostname);
  } catch (e) {
    return res.status(400).json({ error: "That address can't be read." });
  }

  let html = "";
  try { html = await fetchHtml(target.toString()); } catch (e) { html = ""; }

  const host = target.hostname.replace(/^www\./, "");
  const ogTitle = meta(html, ["og:title", "twitter:title"]);
  const rawTitle = decode(((html.match(/<title[^>]*>([\s\S]{0,300})<\/title>/i) || [])[1] || ""));
  const siteName = meta(html, ["og:site_name"]);
  const description = meta(html, ["og:description", "twitter:description", "description"]);
  const image = meta(html, ["og:image", "twitter:image"]);

  // A product name: prefer the site name, else the part of <title> before a separator.
  let name = siteName || ogTitle || rawTitle || host.split(".")[0];
  name = name.split(/\s[|\-–—:·]\s/)[0].trim().slice(0, 60) || host.split(".")[0];
  name = name.charAt(0).toUpperCase() + name.slice(1);

  const tagline = (description || ogTitle || rawTitle || "").slice(0, 90);
  const text = ((rawTitle || "") + " " + (ogTitle || "") + " " + (description || "")).toLowerCase();

  const cats = match(CATEGORIES, text, 1);
  const body = {
    ok: true,
    found: !!html,
    source: target.toString(),
    name: name,
    tagline: tagline,
    description: (description || "").slice(0, 400),
    category: cats[0] || "SaaS",
    tags: keywords(text, 4),
    platforms: match(PLATFORMS, text, 3).concat(["Web"]).filter(function (v, i, a) { return a.indexOf(v) === i; }).slice(0, 3),
    audiences: match(AUDIENCES, text, 3),
    ogImage: image || null,
    // Deterministic artwork seed so the same URL always yields the same look.
    seed: Math.abs(Array.from(host + name).reduce(function (h, c) { return (h * 31 + c.charCodeAt(0)) | 0; }, 7)) % 10,
  };
  if (!html) body.note = "Could not read that page, so these are best-guess defaults.";
  return res.status(200).json(body);
};
