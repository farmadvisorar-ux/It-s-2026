// Server-side database access for the Launchboard API functions.
//
// Talks to Supabase's PostgREST endpoint with the project's *publishable* key.
// That key is safe to ship: every table is protected by row-level security, and
// the policies only allow exactly what this site needs —
//   lb_submissions / lb_subscribers : INSERT only (nobody can read the emails back)
//   lb_reviews / lb_comments        : SELECT + INSERT (public community content)
//   lb_votes                        : SELECT only; toggling goes through the
//                                     lb_toggle_vote() function so one visitor
//                                     can never delete another's vote
//   lb_public_listings              : SELECT only; a view over the approved
//                                     submissions that omits the email column
//   lb_admin                        : no access at all — the moderation
//                                     functions read it as SECURITY DEFINER
// Every other table in the project has RLS on with no policies, so this key
// grants no access to them at all.
//
// Env vars win when present, so the deployment can be pointed at another
// project without a code change.

const BASE = (process.env.SUPABASE_URL || "https://ecbuxyskpjixiojregtp.supabase.co").replace(/\/+$/, "");
const KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_VBaVgCAytBY7nybQ_9AgZg_LB5Bp-9K";

function headers(extra) {
  return Object.assign(
    { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" },
    extra || {}
  );
}

// GET rows. `query` is a PostgREST path such as "lb_reviews?product_slug=eq.x".
async function select(query) {
  const res = await fetch(BASE + "/rest/v1/" + query, { headers: headers() });
  if (!res.ok) throw new Error("select " + query + " failed: " + res.status + " " + (await res.text()));
  return res.json();
}

// INSERT a row. Returns the raw response so callers can special-case conflicts.
async function insert(table, row) {
  return fetch(BASE + "/rest/v1/" + table, {
    method: "POST",
    headers: headers({ Prefer: "return=minimal" }),
    body: JSON.stringify(row),
  });
}

// Call a Postgres function.
async function rpc(fn, args) {
  const res = await fetch(BASE + "/rest/v1/rpc/" + fn, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error("rpc " + fn + " failed: " + res.status + " " + (await res.text()));
  return res.json();
}

// Call a Postgres function without throwing, so the caller can tell an
// "unauthorized" answer (a raised exception inside the function) apart from a
// transport failure.
async function rpcTry(fn, args) {
  const res = await fetch(BASE + "/rest/v1/rpc/" + fn, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(args),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) { /* not JSON */ }
  return { ok: res.ok, status: res.status, data: data, text: text };
}

module.exports = { select, insert, rpc, rpcTry, BASE };
