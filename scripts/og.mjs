/**
 * Regenerates every Open Graph link-preview image in public/og/.
 *
 *   node scripts/og.mjs
 *
 * One card per indexed detail page plus a default, all 1200×630 JPEG, composed
 * from the same catalog photography the pages use. Source photos come from
 * src/data/images.json, so a card can never point at a photo the page does not
 * show. Any slug with no photo is skipped and reported rather than silently
 * producing a card with an empty frame.
 *
 * Fonts are pulled from Google Fonts into .cache/fonts (gitignored) on first
 * run and registered with fontconfig for librsvg, which is what actually draws
 * the text inside the SVG overlay. They are the same two families the site
 * loads, so the cards and the pages read as one design.
 */
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');

const W = 1200;
const H = 630;
const PAD = 68;

const INK = '#2b2622';       // warm charcoal — the scrim
const BONE = '#faf7f2';      // wordmark and title
const BARN = '#b23a31';      // accent rule, lifted one step for contrast on photo
const MUTED = '#e0d5c6';     // eyebrow

const FONT_DIR = path.join(root, '.cache', 'fonts');
const FONTS = [
  ['Bitter-Bold.ttf', 'family=Bitter:wght@700'],
  ['SourceSans3-SemiBold.ttf', 'family=Source+Sans+3:wght@600'],
];

/** Download the two families once and make fontconfig aware of them. */
async function ensureFonts() {
  await mkdir(FONT_DIR, { recursive: true });
  for (const [file, query] of FONTS) {
    const dest = path.join(FONT_DIR, file);
    if (existsSync(dest)) continue;
    const css = await fetch(`https://fonts.googleapis.com/css2?${query}&display=swap`, {
      // Without a browser UA the API answers with woff2, which librsvg cannot read.
      headers: { 'User-Agent': 'Mozilla/5.0' },
    }).then((r) => r.text());
    const url = css.match(/https:\/\/[^)]*\.ttf/)?.[0];
    if (!url) throw new Error(`no ttf in the CSS for ${query}`);
    const buf = Buffer.from(await fetch(url).then((r) => r.arrayBuffer()));
    await writeFile(dest, buf);
    console.log(`  fetched ${file}`);
  }
  const home = process.env.HOME ?? '/root';
  const userFonts = path.join(home, '.fonts');
  await mkdir(userFonts, { recursive: true });
  for (const [file] of FONTS) {
    await writeFile(path.join(userFonts, file), await readFile(path.join(FONT_DIR, file)));
  }
  await run('fc-cache', ['-f']).catch(() => {});
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Greedy wrap on an estimated advance width. Bitter Bold runs a little wide;
 * 0.54em per character is close enough for a two-line headline and avoids
 * shelling out to a text-shaping library for 93 images.
 */
function wrap(text, fontSize, maxWidth, maxLines) {
  const perChar = fontSize * 0.54;
  const limit = Math.max(8, Math.floor(maxWidth / perChar));
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > limit && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length > maxLines ? null : lines;
}

/** Shrink the headline until it fits the space it has. */
function fitTitle(text, maxWidth) {
  for (const size of [62, 56, 50, 45, 40, 36]) {
    const lines = wrap(text, size, maxWidth, size > 45 ? 2 : 3);
    if (lines) return { size, lines };
  }
  return { size: 34, lines: wrap(text, 34, maxWidth, 4) ?? [String(text)] };
}

function overlay(eyebrow, title) {
  const maxWidth = W - PAD * 2 - 20;
  const { size, lines } = fitTitle(title, maxWidth);
  const lineHeight = Math.round(size * 1.16);
  const baseline = H - PAD - (lines.length - 1) * lineHeight;

  const titleSvg = lines
    .map(
      (l, i) =>
        `<text x="${PAD}" y="${baseline + i * lineHeight}" font-family="Bitter" font-size="${size}" font-weight="700" fill="${BONE}">${esc(l)}</text>`
    )
    .join('');

  const eyebrowY = baseline - lines.length * lineHeight - 8;

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.18" stop-color="${INK}" stop-opacity="0"/>
      <stop offset="0.62" stop-color="${INK}" stop-opacity="0.62"/>
      <stop offset="1" stop-color="${INK}" stop-opacity="0.94"/>
    </linearGradient>
    <linearGradient id="top" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${INK}" stop-opacity="0.5"/>
      <stop offset="1" stop-color="${INK}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#scrim)"/>
  <rect width="${W}" height="190" fill="url(#top)"/>

  <!-- wordmark: solid barn mark, name over a letterspaced sub-line -->
  <g transform="translate(${PAD} 46)">
    <path fill="${BONE}" fill-rule="evenodd"
      d="M18 2.9 27.5 8.1 33.8 14 33.8 33.1 2.2 33.1 2.2 14 8.5 8.1 Z M14 33.1 14 20.9 22 20.9 22 33.1 Z"/>
    <text x="48" y="20" font-family="Bitter" font-size="26" font-weight="700" fill="${BONE}">Marshall</text>
    <text x="49" y="34" font-family="Source Sans 3" font-size="12" font-weight="600"
          letter-spacing="3.1" fill="${MUTED}">SHEDS</text>
  </g>

  <rect x="${PAD}" y="${eyebrowY - 40}" width="64" height="5" rx="2.5" fill="${BARN}"/>
  <text x="${PAD}" y="${eyebrowY}" font-family="Source Sans 3" font-size="19" font-weight="600"
        letter-spacing="3.4" fill="${MUTED}">${esc(eyebrow.toUpperCase())}</text>
  ${titleSvg}
</svg>`);
}

async function card(sourceRel, outRel, eyebrow, title) {
  const src = path.join(pub, sourceRel.replace(/^\//, ''));
  const out = path.join(pub, outRel.replace(/^\//, ''));
  await access(src);
  await mkdir(path.dirname(out), { recursive: true });
  await sharp(src)
    .resize(W, H, { fit: 'cover', position: 'attention' })
    .composite([{ input: overlay(eyebrow, title) }])
    .jpeg({ quality: 82, chromaSubsampling: '4:4:4' })
    .toFile(out);
}

const readJson = async (rel) => JSON.parse(await readFile(path.join(root, rel), 'utf8'));

async function main() {
  console.log('fonts…');
  await ensureFonts();

  const images = await readJson('src/data/images.json');
  const types = await readJson('src/data/building-types.json');
  const inventory = await readJson('src/data/inventory.json');
  const portable = await readJson('src/data/portable-buildings.json');
  const site = await readJson('src/data/site.json');

  const jobs = [];
  const skipped = [];

  const hero = images.hero ?? images.types?.garages?.[0];
  if (hero) jobs.push([hero, '/og/default.jpg', 'Steel & portable buildings', site.tagline]);

  for (const t of types) {
    const src = images.types?.[t.slug]?.[0];
    const out = `/og/types/${t.slug.replace(/\//g, '-')}.jpg`;
    if (src) jobs.push([src, out, 'Steel buildings', t.name]);
    else skipped.push(out);
  }

  for (const i of inventory) {
    const src = images.inventory?.[i.slug];
    const out = `/og/inventory/${i.slug}.jpg`;
    if (src) jobs.push([src, out, 'Clearance inventory', i.title]);
    else skipped.push(out);
  }

  for (const p of portable.products) {
    const src = images.portable?.products?.[p.slug]?.[0];
    const out = `/og/portable/${p.slug}.jpg`;
    if (src) jobs.push([src, out, 'Portable buildings', p.name]);
    else skipped.push(out);
  }

  for (const job of jobs) await card(...job);

  console.log(`wrote ${jobs.length} cards`);
  if (skipped.length) console.log(`no source photo for ${skipped.length}: ${skipped.join(', ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
