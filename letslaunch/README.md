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
│   └── submit.js       # POST — validates CSRF token, accepts submission
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

- **Real:** all security headers, the CSRF token issue/validate flow, the
  hardened cookies, client-side validation, the responsive themed UI.
- **Demo:** the product board is sample data, upvotes are remembered per-browser
  in `localStorage`, and `/api/submit` validates + echoes but does not persist.
  Swap in a database and an email/queue step to go fully live.
