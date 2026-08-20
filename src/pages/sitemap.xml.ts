import type { APIRoute } from 'astro';
import types from '../data/building-types.json';
import models from '../data/models.json';
import options from '../data/options.json';
import inventory from '../data/inventory.json';

/**
 * Sitemap generated from the same data the pages are built from, so it cannot
 * drift out of sync with the routes that actually exist.
 */

const SITE = 'https://marshallsheds.com';

type Entry = { path: string; priority: number; changefreq: string };

const staticPages: Entry[] = [
  { path: '/', priority: 1.0, changefreq: 'weekly' },
  { path: '/building-types/', priority: 0.9, changefreq: 'monthly' },
  { path: '/inventory/', priority: 0.9, changefreq: 'weekly' },
  { path: '/options-and-finishes/', priority: 0.8, changefreq: 'monthly' },
  { path: '/models/', priority: 0.8, changefreq: 'monthly' },
  { path: '/sizes/', priority: 0.7, changefreq: 'monthly' },
  { path: '/quote/', priority: 0.9, changefreq: 'monthly' },
  { path: '/contact/', priority: 0.7, changefreq: 'monthly' },
  { path: '/about/', priority: 0.6, changefreq: 'monthly' },
  { path: '/about/our-advantage/', priority: 0.5, changefreq: 'monthly' },
  { path: '/about/warranty/', priority: 0.5, changefreq: 'monthly' },
  { path: '/about/pricing/', priority: 0.6, changefreq: 'monthly' },
  { path: '/resources/', priority: 0.7, changefreq: 'monthly' },
  { path: '/resources/faq/', priority: 0.8, changefreq: 'monthly' },
  { path: '/resources/arch-vs-straight-wall/', priority: 0.7, changefreq: 'yearly' },
  { path: '/resources/galvalume-steel/', priority: 0.6, changefreq: 'yearly' },
  { path: '/resources/building-codes/', priority: 0.6, changefreq: 'yearly' },
  { path: '/resources/assembly/', priority: 0.6, changefreq: 'yearly' },
  { path: '/resources/foundations/', priority: 0.6, changefreq: 'yearly' },
  { path: '/resources/condensation/', priority: 0.6, changefreq: 'yearly' },
  { path: '/privacy/', priority: 0.2, changefreq: 'yearly' },
  { path: '/terms/', priority: 0.2, changefreq: 'yearly' },
];

export const GET: APIRoute = () => {
  const entries: Entry[] = [
    ...staticPages,
    ...(types as any[]).map((t) => ({
      path: `/building-types/${t.slug}/`,
      priority: 0.8,
      changefreq: 'monthly',
    })),
    ...(models as any[]).map((m) => ({
      path: `/models/${m.code.toLowerCase()}/`,
      priority: 0.6,
      changefreq: 'monthly',
    })),
    ...(options as any[]).flatMap((fam) =>
      fam.items.map((o: any) => ({
        path: `/options-and-finishes/${fam.family}/${o.slug}/`,
        priority: 0.5,
        changefreq: 'monthly',
      }))
    ),
    ...(inventory as any[]).map((i) => ({
      path: `/inventory/${i.slug}/`,
      priority: 0.7,
      changefreq: 'weekly',
    })),
  ];

  const lastmod = new Date().toISOString().split('T')[0];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (e) => `  <url>
    <loc>${SITE}${e.path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority.toFixed(1)}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
