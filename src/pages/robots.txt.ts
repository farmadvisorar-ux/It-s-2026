import type { APIRoute } from 'astro';
import site from '../data/site.json';

/**
 * While `indexable` is false the site is reachable but asks not to be indexed.
 * Crawling is deliberately still allowed: search engines have to fetch a page
 * to see its `noindex` meta tag, and a Disallow here would hide that directive
 * while leaving bare URLs eligible to appear in results.
 *
 * The sitemap is withheld until launch so nothing actively invites indexing.
 */
const SITE = (import.meta.env.SITE ?? 'https://anysize.shop').replace(/\/$/, '');

export const GET: APIRoute = () => {
  const body = site.indexable
    ? `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`
    : `# Pre-launch. Pages carry <meta name="robots" content="noindex">.\n` +
      `# Crawling is allowed so that directive is visible; nothing should be indexed.\n` +
      `User-agent: *\nAllow: /\n`;

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
