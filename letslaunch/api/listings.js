// GET /api/listings — the startups that have been approved out of the queue.
//
// Reads lb_public_listings, a database view over lb_submissions that selects
// only the publishable columns. The submitter's email address is not part of
// the view, so it cannot leak here even by accident.

const db = require("./_lib/db.js");

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=30, s-maxage=60");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const rows = await db.select(
      "lb_public_listings?select=slug,name,url,tagline,category,seed,created_at&order=created_at.desc&limit=200"
    );
    return res.status(200).json({
      ok: true,
      count: rows.length,
      listings: rows.map(function (r) {
        return {
          slug: r.slug,
          name: r.name,
          url: r.url,
          tagline: r.tagline,
          category: r.category,
          seed: Number(r.seed) || 0,
          launched: r.created_at,
        };
      }),
    });
  } catch (e) {
    return res.status(502).json({ error: "Could not load listings.", ok: false, listings: [] });
  }
};
