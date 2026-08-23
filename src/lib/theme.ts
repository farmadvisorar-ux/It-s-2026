import { readFileSync } from 'node:fs';

/**
 * Design tokens read out of the stylesheet at build time.
 *
 * `theme-color` and the favicon have to agree with the site's actual palette,
 * and the reliable way to guarantee that is to read it rather than copy it —
 * a duplicated token is one rebrand away from being wrong, and nothing fails
 * when it drifts.
 */
function resolveToken(name: string, fallback: string): string {
  try {
    const css = readFileSync('src/styles/global.css', 'utf8');
    const block = (() => {
      const i = css.indexOf(':root {');
      if (i < 0) return '';
      const s = css.indexOf('{', i);
      return css.slice(s + 1, css.indexOf('}', s));
    })();
    const decls = Object.fromEntries(
      [...block.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => ['--' + m[1], m[2].trim()])
    );
    let v = decls[name] ?? '';
    for (let i = 0; i < 10 && v.startsWith('var('); i++) {
      v = (decls[v.match(/var\((--[\w-]+)\)/)?.[1] ?? ''] ?? '').trim();
    }
    return /^#[0-9a-f]{3,8}$/i.test(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

/** Browser UI colour — the page ground, so the chrome matches the site. */
export const themeColor = resolveToken('--bg', '#ffffff');
/** Brand accent, used for the favicon mark. */
export const accentColor = resolveToken('--accent', '#000000');
