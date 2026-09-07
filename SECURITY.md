# Security headers

## What this document covers

A header scan produced six findings. Two are fixed here, two cannot be fixed on
the current host, and two do not apply to this site at all. The split matters:
treating all six as "done" would leave real gaps behind a green checkmark.

## The constraint that shapes everything below

This site is static Astro published to **GitHub Pages** by
`.github/workflows/deploy.yml`. GitHub Pages serves a fixed set of response
headers and offers no mechanism to add more — no `_headers` file, no config, no
API. A `vercel.json`, a `netlify.toml`, or an Astro middleware would all be
inert files in this repository, because nothing that reads them is in the
serving path.

What remains available is the `<meta http-equiv>` equivalent of a header, which
the browser applies when parsing the document. That covers some directives and
not others.

## Fixed (2 of 6)

Both are set in `src/layouts/Base.astro`, which every page renders through
(directly, or via `Article.astro`).

### Content-Security-Policy — was High

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://sikads.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data: https:;
connect-src 'self' https://sikads.com;
frame-src https://sikads.com;
form-action 'self' https://formspree.io;
base-uri 'self';
object-src 'none'
```

Two parts of this are load-bearing and should not be "tidied":

- **`'unsafe-inline'` in `script-src` is required.** The HTTPS-upgrade snippet,
  both JSON-LD blocks, and the ad embed are all inline `<script is:inline>`.
  A static build on Pages cannot mint a per-response nonce, so the alternative
  is per-script SHA-256 hashes that must be regenerated on every content
  change. This weakens the policy against injected inline script — it is the
  honest cost of the current host, not an oversight.
- **`form-action` must keep `https://formspree.io`.** Both the quote and
  contact forms post there. Narrowing this to `'self'` breaks every enquiry
  silently — the page still renders, the submit still appears to work, and the
  lead is dropped. The deploy workflow already guards the related failure mode
  because it shipped live once.

`frame-ancestors` is **not** in the policy above. It is one of the directives a
`<meta>` CSP cannot express — see below.

### Referrer-Policy — was Info

`<meta name="referrer" content="strict-origin-when-cross-origin">`. Full URL on
same-origin navigation, origin only cross-origin, nothing when leaving HTTPS.

## Cannot be fixed on GitHub Pages (2 of 6)

These are header-only. No markup equivalent exists, so they remain open.

| Finding | Why it can't ship here |
| --- | --- |
| **Permissions-Policy** | No `<meta>` equivalent. Header only. |
| **Cross-Origin-Opener-Policy** | No `<meta>` equivalent. Header only. |

`frame-ancestors` is in the same category, and is why **clickjacking is not
covered** despite CSP being present — a meta CSP silently drops it, and
`X-Frame-Options` is also header-only.

Closing these three requires a host or CDN that can set response headers —
Cloudflare (free tier, Transform Rules), Netlify (`_headers`), or Vercel
(`vercel.json`). That is a deployment change, not a code change, and it is the
single highest-value follow-up in this document. The DNS already points at a
custom domain, so putting Cloudflare in front is the smallest version of it.

Also unticked: **Settings → Pages → Enforce HTTPS**. Until that box is checked,
the inline upgrade snippet in `Base.astro` is doing a job the platform should
do, and the first request still leaves in cleartext. HSTS is likewise a header
and cannot be set from here.

## Not applicable to this repository (2 of 6)

Both `XSRF-TOKEN` findings — the missing `HttpOnly` flag (High) and the missing
`SameSite` attribute (Low) — describe a cookie **this site never sets**.
`XSRF-TOKEN` is the Laravel/Angular CSRF convention; this is a static Astro
build with no server, no session, and no cookie-setting code (`grep -r
"XSRF-TOKEN" src/` returns nothing).

These findings belong to whichever backend actually issued that cookie during
the scan. They are fixed where that cookie is set, by adding the flags to the
framework's cookie config — not in this repository. Adding middleware here to
rewrite a cookie that never exists would be dead code that reads as coverage.

The form endpoint in use is Formspree, which is third-party; its cookie and
header posture is theirs to set, not ours.

## Verifying

Meta-tag policies do not appear in `curl -I`. Check them in the document, and
check enforcement in the browser:

```bash
npm run build
grep -o 'http-equiv="Content-Security-Policy"[^>]*' dist/index.html
```

In DevTools, the Console reports CSP violations as they happen, and Network →
Headers shows what the host actually sent. After any change to the ad config,
the fonts, or the form endpoint, submit both forms and confirm no CSP violation
is logged — a broken `form-action` fails silently.
