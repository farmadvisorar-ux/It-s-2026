// /api/community — the persistence layer for votes, reviews and comments.
//
//   GET  /api/community            → aggregate counts for every product
//   GET  /api/community?slug=x     → that product's reviews, comments, votes
//   POST /api/community            → { action: "vote" | "review" | "comment", ... }
//
// Writes are CSRF-protected (X-CSRF-Token must match the HttpOnly cookie) and
// validated here before they reach the database, which also enforces its own
// length/range constraints.

const db = require("./_lib/db.js");
const { csrfOk, readBody, str, isUrl } = require("./_lib/csrf.js");

const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const enc = encodeURIComponent;

async function aggregates() {
  const [votes, reviews, comments] = await Promise.all([
    db.select("lb_vote_counts?select=product_slug,votes"),
    db.select("lb_review_stats?select=product_slug,reviews,avg_rating"),
    db.select("lb_comment_counts?select=product_slug,comments"),
  ]);
  const v = {}, r = {}, c = {};
  votes.forEach((x) => { v[x.product_slug] = Number(x.votes) || 0; });
  reviews.forEach((x) => { r[x.product_slug] = { count: Number(x.reviews) || 0, avg: Number(x.avg_rating) || 0 }; });
  comments.forEach((x) => { c[x.product_slug] = Number(x.comments) || 0; });
  return { votes: v, reviews: r, comments: c };
}

async function forSlug(slug) {
  const [reviews, comments, votes] = await Promise.all([
    db.select("lb_reviews?product_slug=eq." + enc(slug) + "&select=author,rating,pros,cons,body,created_at&order=created_at.desc&limit=100"),
    db.select("lb_comments?product_slug=eq." + enc(slug) + "&select=author,body,created_at&order=created_at.desc&limit=100"),
    db.select("lb_vote_counts?product_slug=eq." + enc(slug) + "&select=votes"),
  ]);
  return { slug, reviews, comments, votes: votes.length ? Number(votes[0].votes) : 0 };
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  try {
    if (req.method === "GET") {
      const q = req.query || {};
      const slug = str(Array.isArray(q.slug) ? q.slug[0] : q.slug, 80);
      if (slug) {
        if (!SLUG.test(slug)) return res.status(400).json({ error: "Invalid slug." });
        return res.status(200).json(await forSlug(slug));
      }
      return res.status(200).json(await aggregates());
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    if (!csrfOk(req)) {
      return res.status(403).json({ error: "Invalid or missing CSRF token. Refresh and try again." });
    }

    const body = await readBody(req);
    const action = str(body.action, 20);
    const slug = str(body.slug, 80);
    if (!SLUG.test(slug)) return res.status(400).json({ error: "Invalid product." });

    if (action === "vote") {
      const voter = str(body.voter, 64);
      if (voter.length < 8) return res.status(400).json({ error: "Invalid voter key." });
      const rows = await db.rpc("lb_toggle_vote", { p_slug: slug, p_voter: voter });
      const row = Array.isArray(rows) ? rows[0] : rows;
      return res.status(200).json({ ok: true, voted: !!(row && row.voted), votes: Number(row && row.votes) || 0 });
    }

    if (action === "review") {
      const author = str(body.author, 40);
      const rating = parseInt(body.rating, 10);
      if (!author) return res.status(400).json({ error: "Add your name." });
      if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: "Rating must be 1–5." });
      const r = await db.insert("lb_reviews", {
        product_slug: slug, author: author, rating: rating,
        pros: str(body.pros, 120) || null, cons: str(body.cons, 120) || null, body: str(body.body, 600) || null,
      });
      if (!r.ok) return res.status(502).json({ error: "Could not save the review." });
      return res.status(200).json({ ok: true, message: "Review posted — thanks! ⭐" });
    }

    if (action === "comment") {
      const author = str(body.author, 40);
      const text = str(body.body, 600);
      if (!author || !text) return res.status(400).json({ error: "Add your name and a comment." });
      const r = await db.insert("lb_comments", { product_slug: slug, author: author, body: text });
      if (!r.ok) return res.status(502).json({ error: "Could not save the comment." });
      return res.status(200).json({ ok: true, message: "Comment posted 💬" });
    }

    return res.status(400).json({ error: "Unknown action." });
  } catch (e) {
    return res.status(502).json({ error: "Database unavailable. Please try again." });
  }
};
