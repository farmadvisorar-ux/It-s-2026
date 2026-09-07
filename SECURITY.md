# Security Vulnerabilities Fixed

This document outlines the security vulnerabilities that were identified and fixed in this project.

## Overview

A security audit identified 6 vulnerabilities across 2 severity levels:
- **High (2)**: Missing CSP header, XSRF-TOKEN cookie missing HttpOnly flag
- **Low (1)**: XSRF-TOKEN cookie missing SameSite attribute
- **Info (3)**: Missing Referrer-Policy, Permissions-Policy, Cross-Origin-Opener-Policy headers

## Fixes Applied

### 1. Content-Security-Policy (CSP) Header - HIGH

**Vulnerability**: If an attacker manages to inject a script into your page (through a compromised widget, vulnerable plugin, or comment field), there's nothing stopping it from stealing visitor data.

**Fix Applied**: Added comprehensive CSP header via `vercel.json`
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' cdn.jsdelivr.net cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' fonts.googleapis.com; font-src 'self' fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
```

**Impact**: Scripts can only execute from approved sources. Injected scripts are blocked.

### 2. Referrer-Policy Header - INFO

**Vulnerability**: Page URLs containing sensitive information (password reset tokens, private search terms) could leak to third-party sites through the Referer header.

**Fix Applied**: Set to `strict-origin-when-cross-origin`
- Sends full URL only for same-origin requests
- Sends only origin for cross-origin requests
- No referrer for less secure contexts

### 3. Permissions-Policy Header - INFO

**Vulnerability**: Third-party scripts (ads, widgets) could request access to camera, microphone, location, or payment methods without user knowledge.

**Fix Applied**: Disabled high-risk features via `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`

**Impact**: Malicious or compromised third-party code cannot access sensitive device features.

### 4. Cross-Origin-Opener-Policy Header - INFO

**Vulnerability**: A page opened via link could maintain a hidden handle back to the original tab, enabling "tabnabbing" attacks and cross-window exploits.

**Fix Applied**: Set to `same-origin`

**Impact**: Opened pages cannot communicate with the original tab.

### 5. XSRF-TOKEN Cookie - HttpOnly Flag - HIGH

**Vulnerability**: An injected script could read the XSRF-TOKEN cookie directly and impersonate logged-in users. This is the first target of any XSS attack.

**Fix Applied**:
- Added Astro middleware in `src/middleware.ts` to enforce HttpOnly flag
- Configured Vercel adapter for server-side rendering capability
- Middleware intercepts all responses and ensures XSRF-TOKEN cookies include HttpOnly flag

**Impact**: JavaScript cannot access the cookie, even if injected. Server-side validation only.

### 6. XSRF-TOKEN Cookie - SameSite Attribute - LOW

**Vulnerability**: A malicious page in another browser tab could trick the browser into sending this cookie with a forged request, performing unauthorized actions.

**Fix Applied**: Middleware sets `SameSite=Strict` on XSRF-TOKEN cookies

**Impact**: Cookie only sent with requests initiated from this site, not cross-site requests.

## Configuration Files

### `vercel.json`
- Defines all security headers for all routes
- Applied at the CDN/edge level before responses reach clients
- Zero performance impact

### `src/middleware.ts`
- Astro middleware that enhances cookie security
- Runs server-side during request processing
- Ensures HttpOnly and SameSite flags on XSRF-TOKEN cookies

### `astro.config.mjs`
- Updated to use `output: 'hybrid'` with Vercel adapter
- Enables server-side rendering for proper cookie handling
- Static pages remain static; only necessary pages use SSR

## Additional Security Headers Added

Beyond the 6 vulnerabilities, we also added:

- **X-Content-Type-Options**: Prevents MIME-type sniffing attacks
- **X-Frame-Options**: Prevents clickjacking by blocking framing
- **X-XSS-Protection**: Legacy XSS protection for older browsers
- **Strict-Transport-Security**: Forces HTTPS connections

## Testing Security Headers

To verify headers are properly set:

```bash
# For local development
npm run dev
# Then in another terminal:
curl -I http://localhost:3000/

# For production (after deployment)
curl -I https://yourdomain.com/
```

Look for all the security headers in the response.

## External API Endpoints

If your form endpoints (quote, contact) are handled by external services:

1. **Your Backend**: Ensure it also sets HttpOnly and SameSite on any XSRF-TOKEN cookies
2. **Third-Party Services**: Ask the provider to set proper cookie security flags
3. **Verification**: Test cookie attributes using browser DevTools (Application → Cookies)

## Deployment

When deploying to Vercel:

1. Both `vercel.json` and `src/middleware.ts` are required
2. The Vercel adapter will auto-detect Astro and apply configuration
3. Hybrid rendering means:
   - Static pages: Pre-built and cached at edge
   - Dynamic pages: Rendered on-demand with SSR capabilities

## Security Best Practices Going Forward

1. **Keep dependencies updated**: Regularly update Astro and packages
2. **Input validation**: Always validate and sanitize user input
3. **HTTPS only**: Ensure site is HTTPS-only (Vercel does this automatically)
4. **Regular audits**: Run security audits regularly to catch new vulnerabilities
5. **Monitor cookies**: Review any new cookies added to ensure they have proper flags

## References

- [OWASP Content Security Policy](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- [MDN Security Headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers)
- [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [Astro Security Best Practices](https://docs.astro.build/en/guides/security/)
