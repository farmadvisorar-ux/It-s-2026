/**
 * Pre-publish check on titles and meta descriptions across the built site.
 *
 * These are the fields Google actually prints in a result. They fail quietly:
 * an over-long title is cut mid-word, and two pages sharing a title compete
 * with each other instead of ranking. Nothing in the build notices, so this
 * does.
 *
 * Run against dist/ after `astro build`. Exits non-zero on any violation.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const DIST = 'dist';
const TITLE_MAX = 60; // ~600px of SERP width; beyond this Google truncates
const DESC_MAX = 160;

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const decode = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#8212;/g, '—');

const pages = walk(DIST).filter((p) => p.endsWith('.html'));
if (pages.length === 0) {
  console.error('::error::no HTML found in dist/ — did the build run?');
  process.exit(1);
}

const titles = new Map();
const descriptions = new Map();
const problems = [];

for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  const route = file.replace(DIST, '').replace(/\/index\.html$/, '/') || '/';
  const title = decode((html.match(/<title>([^<]*)<\/title>/) ?? [])[1] ?? '');
  const description = decode(
    (html.match(/<meta name="description" content="([^"]*)"/) ?? [])[1] ?? ''
  );

  if (!title) problems.push(`${route} has no <title>`);
  if (!description) problems.push(`${route} has no meta description`);
  if (title.length > TITLE_MAX)
    problems.push(`${route} title is ${title.length} chars (max ${TITLE_MAX}): ${title}`);
  if (description.length > DESC_MAX)
    problems.push(`${route} description is ${description.length} chars (max ${DESC_MAX})`);

  if (title) (titles.get(title) ?? titles.set(title, []).get(title)).push(route);
  if (description)
    (descriptions.get(description) ?? descriptions.set(description, []).get(description)).push(route);
}

for (const [value, routes] of titles)
  if (routes.length > 1) problems.push(`${routes.length} pages share the title "${value}": ${routes.join(', ')}`);
for (const [, routes] of descriptions)
  if (routes.length > 1) problems.push(`${routes.length} pages share a description: ${routes.join(', ')}`);

if (problems.length) {
  for (const p of problems) console.error(`::error::${p}`);
  console.error(`\n${problems.length} metadata problem(s) across ${pages.length} pages`);
  process.exit(1);
}

console.log(`metadata OK — ${pages.length} pages, all titles unique and within ${TITLE_MAX}, descriptions within ${DESC_MAX}`);
