// GET /api/products — public, machine-readable product catalog.
//
// This is the "AI discoverability" layer: a stable JSON feed that AI assistants,
// agents and MCP clients can read to recommend products from the directory.
// CommonJS on purpose (see api/package.json). The JSON files are `require`d so
// Vercel's bundler traces and ships them with the function.
//
// Query params:
//   ?slug=draftly     → a single product
//   ?category=SaaS    → filter by category
//   ?useCase=...      ?audience=...   ?platform=...
//   ?limit=50         → cap results (default 100, max 250)

const startups = require("../data/startups.json");
const ph = require("../data/ph.json");
const pp = require("../data/pp.json");

function shape(s) {
  const x = ph[s.slug] || {};
  const p = pp[s.slug] || {};
  return {
    slug: s.slug,
    name: s.name,
    tagline: s.tagline,
    description: s.description,
    url: s.website,
    category: s.category,
    tags: s.tags || [],
    pricing: x.pricing || null,
    rating: x.rating || null,
    ratingCount: x.ratingCount || 0,
    award: x.award || null,
    stack: x.stack || [],
    platforms: p.platforms || [],
    useCases: p.useCases || [],
    audiences: p.audiences || [],
    aiRank: p.aiRank || null,
    impressions: p.impressions || 0,
    upvotes: s.subscribers,
    maker: s.maker ? { name: s.maker.name, role: s.maker.role } : null,
    launchedDaysAgo: s.daysAgo,
    boosted: !!s.boosted,
  };
}

module.exports = function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  // Public read-only catalog: safe and intentional to allow cross-origin reads.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const q = req.query || {};
  const one = (v) => (Array.isArray(v) ? v[0] : v);
  const slug = one(q.slug);

  let list = startups.map(shape);

  if (slug) {
    const found = list.filter((p) => p.slug === String(slug))[0];
    if (!found) return res.status(404).json({ error: "Product not found", slug: String(slug) });
    return res.status(200).json({ product: found });
  }

  const has = (arr, val) => arr.some((v) => String(v).toLowerCase() === String(val).toLowerCase());
  if (q.category) list = list.filter((p) => String(p.category).toLowerCase() === String(one(q.category)).toLowerCase());
  if (q.useCase) list = list.filter((p) => has(p.useCases, one(q.useCase)));
  if (q.audience) list = list.filter((p) => has(p.audiences, one(q.audience)));
  if (q.platform) list = list.filter((p) => has(p.platforms, one(q.platform)));

  let limit = parseInt(one(q.limit), 10);
  if (!limit || limit < 1) limit = 100;
  if (limit > 250) limit = 250;

  return res.status(200).json({
    source: "Launchboard",
    docs: "/#/integrate",
    license: "Free to read and cite. Please link back to the product page.",
    count: Math.min(list.length, limit),
    total: list.length,
    products: list.slice(0, limit),
  });
};
