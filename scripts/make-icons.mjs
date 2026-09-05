/**
 * Generates public/favicon.svg and public/apple-touch-icon.png.
 *
 * Both are derived from the header's brand mark and the accent token, for the
 * same reason the link previews are: an icon drawn by hand is a copy of the
 * logo that stops being a copy the moment the logo changes, and a stale
 * favicon is the kind of thing nobody notices for months.
 *
 *   node scripts/make-icons.mjs
 */
import { readFile, writeFile } from 'fs/promises';
import sharp from 'sharp';

const css = await readFile('src/styles/global.css', 'utf8');
const block = (() => {
  const i = css.indexOf(':root {');
  const s = css.indexOf('{', i);
  return css.slice(s + 1, css.indexOf('}', s));
})();
const decls = Object.fromEntries(
  [...block.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => ['--' + m[1], m[2].trim()])
);
const resolve = (v) => {
  let x = (v ?? '').trim();
  for (let i = 0; i < 10 && x.startsWith('var('); i++) x = (decls[x.match(/var\((--[\w-]+)\)/)[1]] ?? '').trim();
  return x;
};
const accent = resolve(decls['--accent']);
const ground = resolve(decls['--bg']);

const header = await readFile('src/components/Header.astro', 'utf8');
const m = header.match(/<svg class="brand__mark"[^>]*viewBox="([^"]+)"[^>]*>([\s\S]*?)<\/svg>/);
if (!m) throw new Error('could not find .brand__mark in Header.astro');
const [, viewBox, body] = m;

// A favicon renders at 16px, where a hairline stroke disappears. Thicken it.
const mark = body.replace(/currentColor/g, accent).replace(/stroke-width="[\d.]+"/g, 'stroke-width="2.9"');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">
  <rect width="100%" height="100%" fill="${ground}"/>
  ${mark.trim()}
</svg>`;
await writeFile('public/favicon.svg', svg + '\n');

await sharp(Buffer.from(svg)).resize(180, 180).png().toFile('public/apple-touch-icon.png');
console.log(`icons written — mark from Header.astro, accent ${accent} on ${ground}`);
