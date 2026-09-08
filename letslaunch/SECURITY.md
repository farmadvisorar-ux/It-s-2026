# Security posture — every scan finding, closed

The original site (`startupbase.io/products/letslaunch`) scored a **D** on a
header scan. This project was built to fix the same six findings *properly*. The
key difference is the host: the original is on a platform that can only emit
`<meta>` tags, so four of its findings can't truly be closed. This project is on
**Vercel**, which sets real response headers — so all six are closed at the edge
and in code.

| # | Finding (original) | Severity | Status here | Where |
| - | ------------------ | -------- | ----------- | ----- |
| 1 | Missing Content-Security-Policy | High | ✅ Fixed | `vercel.json` |
| 2 | Missing Referrer-Policy | Info | ✅ Fixed | `vercel.json` (+ meta) |
| 3 | Missing Permissions-Policy | Info | ✅ Fixed | `vercel.json` |
| 4 | Missing Cross-Origin-Opener-Policy | Info | ✅ Fixed | `vercel.json` |
| 5 | `XSRF-TOKEN` missing `HttpOnly` | High | ✅ Fixed | `api/csrf.js` |
| 6 | `XSRF-TOKEN` missing `SameSite` | Low | ✅ Fixed | `api/csrf.js` |

## 1. Content-Security-Policy (was High)

A strict, allow-list CSP is served on every response:

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:;
font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none';
base-uri 'self'; object-src 'none'; upgrade-insecure-requests
```

Notice there is **no `'unsafe-inline'`**. That is deliberate and only possible
because the site was built for it: all CSS lives in `/assets/styles.css`, all
JavaScript in `/assets/app.js`, and there are zero inline `<script>` blocks,
zero inline `style=` attributes, and zero `onclick`-style handlers. An injected
inline script has nothing to run under. `frame-ancestors 'none'` blocks
clickjacking — and unlike a `<meta>` CSP, a real header actually enforces it.

## 2. Referrer-Policy (was Info)

`strict-origin-when-cross-origin` as a real header, backed up by a matching
`<meta name="referrer">` in the HTML. Full URL on same-origin navigation, origin
only across origins, nothing when downgrading to HTTP.

## 3. Permissions-Policy (was Info)

Camera, microphone, geolocation, payment, USB and friends are all denied
(`camera=()`, `microphone=()`, `geolocation=()`, …). A compromised third-party
script can't ask the browser for hardware it was never granted. There is no
`<meta>` equivalent for this header — which is exactly why the original site
could not close it and this one can.

## 4. Cross-Origin-Opener-Policy (was Info)

`same-origin`. A window this page opens can't retain a scripting handle back
into it, which cuts off the tabnabbing / cross-window class of attacks. Also
header-only, also un-closable with meta tags.

## 5 & 6. The `XSRF-TOKEN` cookie (High + Low)

The scan flagged this cookie for missing `HttpOnly` and missing `SameSite`.
`api/csrf.js` sets it with **both**, plus `Secure`:

```
Set-Cookie: XSRF-TOKEN=<token>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=7200
```

The usual objection is that a CSRF cookie has to be JS-readable for the
double-submit pattern — which is why so many sites ship it without `HttpOnly`.
This project avoids that trap with the **synchronizer-token** pattern:

- `/api/csrf` returns the token in the **JSON body** *and* sets it in the
  HttpOnly cookie.
- The browser sends the token back in the `X-CSRF-Token` **header**.
- `/api/submit` compares header vs. cookie **server-side** (constant-time),
  where reading an HttpOnly cookie is no problem.

So the cookie stays HttpOnly *and* SameSite=Strict, an XSS payload can't read
it, and cross-site forged posts can't ride it — both findings closed with no
loss of function.

## Bonus hardening (beyond the scan)

`vercel.json` also sends `Strict-Transport-Security` (HSTS, 2-year, preload),
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and
`Cross-Origin-Resource-Policy: same-origin`.

## Verifying it yourself

Real headers show up in `curl` (unlike the meta-only approach):

```bash
curl -sSI https://<your-deployment>.vercel.app/ | grep -iE \
  'content-security-policy|referrer-policy|permissions-policy|cross-origin-opener|strict-transport'

# Confirm the hardened cookie:
curl -sSI https://<your-deployment>.vercel.app/api/csrf | grep -i set-cookie
```

Or paste the URL into a header scanner and watch the grade go from D to A.
