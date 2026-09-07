import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();

  // Enhance cookie security headers if XSRF-TOKEN is set
  const setCookieHeader = response.headers.get('set-cookie');
  if (setCookieHeader?.includes('XSRF-TOKEN')) {
    // Parse and enhance the cookie with HttpOnly and SameSite attributes
    let enhancedCookie = setCookieHeader;

    // Add HttpOnly flag if not present
    if (!enhancedCookie.includes('HttpOnly')) {
      enhancedCookie = enhancedCookie.replace(/;(\s*expires|;|\s*max-age|;|\s*path|;|\s*domain)/i, '; HttpOnly$1');
    }

    // Add SameSite=Strict if not present
    if (!enhancedCookie.includes('SameSite')) {
      enhancedCookie += '; SameSite=Strict';
    }

    response.headers.set('set-cookie', enhancedCookie);
  }

  return response;
});
