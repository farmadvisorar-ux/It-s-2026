# Launchboard

A free launch directory for SaaS & micro-SaaS products — founders submit a
product, it lands on the daily board, the community upvotes, and the winners get
featured with a real backlink. Built as an original, **security-hardened**
project inspired by the "launch directory" category.

> This is your own project. Rename it, restyle it, and wire the API to a real
> database whenever you're ready — the branding here is a neutral placeholder,
> not a copy of anyone else's product.

## Why this exists

It started from a header scan of a similar site that scored a **D** (missing
CSP, Referrer-Policy, Permissions-Policy and COOP headers, plus an unhardened
`XSRF-TOKEN` cookie). The interesting constraint: that site is hosted somewhere
that can only emit `<meta>` tags, so most of those findings *can't* be fixed
there. This project fixes **all six, for real**, by hosting on Vercel and
setting true response headers. See [`SECURITY.md`](./SECURITY.md) for the
finding-by-finding breakdown.

## Stack

- **Static HTML/CSS/JS** — no framework, no build step, no external CDN.
  Everything is same-origin so the CSP can stay strict (no `'unsafe-inline'`).
- **Vercel serverless functions** (`/api`) — issue and validate a CSRF token.
- **`vercel.json`** — all the security response headers.

## Project layout

```
letslaunch/
├── index.html          # the whole landing page + directory + submit form
├── assets/
│   ├── styles.css      # all styling (so CSP forbids inline styles)
│   ├── app.js          # all behavior (so CSP forbids inline scripts)
│   ├── logo.svg
│   └── favicon.svg
├── api/
│   ├── csrf.js         # GET  — issues CSRF token, sets hardened cookie
│   ├── submit.js       # POST — validates CSRF token, stores a submission
│   ├── community.js    # GET/POST — votes, reviews, comments
│   ├── newsletter.js   # POST — daily-digest signups
│   ├── autofill.js     # GET  — reads a URL and drafts the listing (SSRF-guarded)
│   ├── listings.js     # GET  — the approved submissions, as board entries
│   ├── admin.js        # POST — the moderation queue, behind a passphrase
│   └── products.js     # GET  — public machine-readable catalog
├── vercel.json         # security headers (CSP, Referrer-Policy, etc.)
├── robots.txt
└── SECURITY.md         # every scan finding mapped to its fix
```

## Run locally

```bash
npm i -g vercel      # once
cd letslaunch
vercel dev           # serves the static site + /api functions
```

Or just open `index.html` for the static parts (the CSRF-protected form needs
the `/api` functions, so it works fully under `vercel dev` or on the deployment).

## Deploy

```bash
cd letslaunch
vercel --prod
```

Vercel auto-detects: static files are served as-is, `api/*.js` become Node
serverless functions, and `vercel.json` applies the headers.

## What's real vs. demo

- **Real:** all security headers; the CSRF issue/validate flow and hardened
  cookies; **persistence** — startup submissions, newsletter signups, reviews,
  comments and upvotes are all stored in Postgres (Supabase) and shared across
  every visitor; the moderation queue and the generated listing artwork; the
  public product API (`/api/products`) and `llms.txt`.
- **Demo:** the 15 seed products themselves are sample data, and the ratings,
  impressions, AI ranks and public MRR shown on them are illustrative rather
  than measured from real traffic.

## Data & privacy

Community data lives in Postgres behind row-level security. The publishable key
the API uses can do exactly five things and nothing else:

| Allowed | Blocked |
| --- | --- |
| read reviews + comments | reading submitter or subscriber emails |
| append a review or comment | updating or deleting anything |
| append a submission / subscriber | reading any other table in the project |
| read vote counts | deleting another visitor's vote |
| toggle its own vote via `lb_toggle_vote()` | reading the moderator passphrase hash |
| read **approved** listings via `lb_public_listings` | reading pending or rejected submissions |

Submissions and subscriber emails are **insert-only**: there is no read path for
them through the public key. Votes can only change through a `security definer`
function, so one visitor can never remove another's vote.

## Moderation

A submission is invisible until a moderator approves it. `#/admin` asks for a
passphrase, which the **database** checks — `lb_admin` holds a bcrypt hash in a
table with RLS on and no policies, so the publishable key cannot read it, and
`lb_admin_queue()` / `lb_admin_decide()` are `security definer` functions that
verify the hash before touching a row. Nothing in this repository is a
credential, and the passphrase is held in the moderator's tab only — never in
localStorage, never in a URL.

Once approved, a submission joins the board as a full listing. It needs no
uploaded artwork: the logo and cover are SVGs generated from the product name
and a stored seed, so the same startup always looks the same. `img-src 'self'
data:` already permits them, so the strict CSP is untouched.

To rotate the passphrase, run this against the database (never commit the value):

```sql
update public.lb_admin
   set passphrase_hash = extensions.crypt('<new passphrase>', extensions.gen_salt('bf', 10)),
       updated_at = now()
 where id = 1;
```

<!-- Live deploy via Vercel git integration. -->
