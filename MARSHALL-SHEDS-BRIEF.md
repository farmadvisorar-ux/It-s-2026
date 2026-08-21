# Marshall Sheds — build brief

Hand this file to a fresh Claude Code session in the new project box. It contains
everything needed to stand up a second dealer site from the Any Size codebase:
what to copy, what must not be copied, and a design direction that makes the two
sites read as different businesses rather than one template used twice.

Source repo: `https://github.com/farmadvisorar-ux/It-s-2026`
Source site: Any Size — `anysize.shop` (Astro 4, static, 160 pages)

---

## 0. Read this before writing any code

The code, the copy and the photography are all the owner's to reuse — this is
the same business, and the site was built from scratch rather than copied from
anyone. There is no copyright question here. There is a **search-ranking**
question, and it is the thing most likely to make this project backfire.

Two sites for one business, sharing an address, a phone number, a product
catalog and a service area, is the pattern Google's duplicate-business and
doorway filters are built to catch. Re-skinning the CSS does not help: the
comparison is made on content and business identity, not on visual design. The
realistic outcome of a straight clone with new paint is that **both** sites rank
worse than Any Size ranks today, because they split the same signals and
cannibalise each other. The NAP consistency work already done on Any Size is
precisely what a second identical NAP undermines.

So the differentiation that counts is not the UI. It is this:

| Signal | Any Size | Marshall Sheds |
|---|---|---|
| Product focus | Engineered **steel kits**, shipped nationwide | Wood **portable buildings**, delivered finished |
| Geography | National, with East Texas local pages | Marshall / Harrison County and the immediate area |
| Phone | (903) 690-5969 | **must be a different number** |
| Buyer | Someone specifying a 60×100 shop or hangar | Someone buying a 12×24 barn for the back yard |
| Copy | Existing text | **Rewritten from scratch, not paraphrased** |

Give the two brands a real split — steel/national versus wood/local is a clean
one that already exists in the catalog — and both sites can rank, because they
are answering different searches. Skip the split and you are running two sites
that compete with each other for the same customer.

A second phone line (Google Voice is free) is the single highest-value item on
that list. Same address is survivable; same phone number is what merges two
business entities in Google's eyes.

Everything below assumes the split. If the owner decides against it, build it
anyway and say plainly in the handover that the two sites will compete.

---

## 1. Get the code

```bash
git clone https://github.com/farmadvisorar-ux/It-s-2026.git marshall-sheds
cd marshall-sheds
rm -rf .git dist
git init && git add -A && git commit -m "Fork Any Size codebase as Marshall Sheds"
npm install
npm run dev          # http://localhost:4321 — confirm the source site builds first
```

Confirm `npm run build` reports 160 pages before changing anything. If it does
not, fix that first; do not debug a broken build and a rebrand at the same time.

---

## 2. Mechanical rebrand

These are the find-and-replace jobs. None of them require judgement.

**`src/data/site.json`** — the single source of truth for identity. Every page
reads from it, so this file drives the footer, the contact page, the schema and
the OG tags at once.

```json
{
  "name": "Marshall Sheds",
  "tagline": "<new tagline — see §3>",
  "description": "<new description — see §3>",
  "phone": "(903) XXX-XXXX",
  "phoneRaw": "+1903XXXXXXX",
  "email": "info@<newdomain>",
  "emails": { "info": "...", "sales": "...", "quotes": "..." },
  "address": { "street": "360 PR 1031", "city": "Marshall", "region": "TX", "postal": "75672", "country": "USA" },
  "hours": "Mon–Fri 8:00am–6:00pm",
  "dealerNotice": "<rewritten — see §3>",
  "indexable": false,
  "emailPending": true,
  "formEndpoint": ""
}
```

Keep `indexable: false` and `emailPending: true` until launch. They are the two
safety flags: the first puts `noindex` on every page, the second hides the email
address everywhere including the schema. Flipping them is the last step of the
project, not the first.

**Other mechanical edits:**

| File | Change |
|---|---|
| `package.json` | `"name": "marshall-sheds"` |
| `astro.config.mjs` | `site: 'https://<newdomain>'` |
| `public/CNAME` | new domain, one line, no protocol |
| `src/layouts/Base.astro` | the `new URL('https://anysize.shop')` fallback on the `origin` line |
| `src/components/Header.astro` | brand SVG mark and `<strong>Any</strong> Size` wordmark |
| `src/components/Footer.astro` | same wordmark |
| `src/scripts/form-submit.js` | the hardcoded phone number in the two fallback strings |
| `src/pages/quote.astro` | hardcoded phone in `successBody` |
| `src/pages/contact.astro` | hardcoded phone in `successBody` |
| `README.md` | rewrite for the new brand |
| `public/og/*` | regenerate — 93 images with the old wordmark baked in |

**Keep `public/.nojekyll`,** and treat it as load-bearing. GitHub Pages runs
Jekyll, Jekyll ignores any path beginning with an underscore, and Astro emits
all its CSS and JS into `_astro/`. Without that file the site deploys
successfully and renders with zero styling, with no error message anywhere. The
build workflow asserts its presence for exactly this reason.

**Verification sweep** — after the rename, this must return nothing:

```bash
npm run build
grep -ril "any size\|anysize" dist/ src/ public/ --exclude-dir=node_modules
```

---

## 3. Content divergence — the part that matters

The catalog data can be reused as *structure*. The prose cannot be reused as
*prose*. Every `intro`, `detail`, `headline`, `summary` and FAQ answer needs to
be rewritten, because duplicate paragraphs across two sites is exactly the
signal that flags both.

Rewriting is not paraphrasing. Changing "engineered for your site" to "engineered
for your location" fools nothing. The reliable method is to close the source
file, decide what the paragraph needs to say, and write it fresh in a different
voice.

**Give Marshall Sheds a different voice on purpose.** Any Size is written flat
and technical — spans, gauges, load values, no adjectives. Marshall Sheds sells
a 10×16 barn to somebody's back yard; write it plain and conversational, second
person, shorter sentences, concrete rather than specified. Same honesty, a
different register. Two voices are harder to fake than two colour schemes and
count for far more.

**Scope the catalog down.** Marshall Sheds does not need the 24 steel building
types or the 52-item steel clearance list. Suggested inclusion:

- Keep: all 16 portable buildings, the construction spec, warranty, financing
- Keep: the East Texas location pages, tightened to Harrison County and neighbours
- Cut: `building-types.json`, `models.json`, `inventory.json`, `options.json`,
  and the steel half of `faqs.json` — plus every page and route that reads them
- Cut: the "6 ft to 200 ft" framing entirely; that is Any Size's line

A 40-page site that owns "portable buildings Marshall TX" beats a 160-page site
that half-heartedly duplicates a stronger sibling.

**Rewrite from scratch, do not adapt:** `dealerNotice`, `tagline`,
`description`, the About pages, Warranty, Privacy, Terms, and all 12 portable
FAQ answers.

**Do not copy across:** manufacturer testimonials or reviews of any kind. There
are none in the source and there should be none in the fork — inventing social
proof for a new brand is fabrication, and review fraud is separately illegal.

---

## 4. UI/UX divergence — concrete spec

The instruction is that the two should not read as the same template. Below is a
direction that diverges structurally, not cosmetically. Swapping the accent
colour and calling it done will not survive a side-by-side look.

### What Any Size currently is (the thing to move away from)

Cool steel-gray palette with a warm amber accent; Inter throughout at tight
letter-spacing; 4px and 8px radii; a sticky translucent header with two
six-column mega menus; card grids everywhere; 1200px measure; automatic dark
mode. It reads industrial, dense, catalog-like.

### Direction for Marshall Sheds

**Palette — warm, not cool.** Bone or cream ground (`#faf7f2`), warm charcoal
text (`#2b2622`), a barn-red or deep-forest accent. The contrast between a
warm ground and a cool one is visible instantly and at a glance, which is
exactly the test being applied.

**Type — two families, not one.** A serif for headings (Bitter, Zilla Slab or
Fraunces — all on Google Fonts, which is the only external host the CSP allows)
against a humanist sans for body copy. Any Size is single-family Inter; a
serif/sans pairing is a different design language, not a different setting.

**Shape — soft, not sharp.** Radii to 12–16px, shadows softer and warmer,
1px borders replaced with tonal background steps. Industrial precision becomes
domestic warmth.

**Navigation — kill the mega menu.** It is the most recognisable single element
of the source. With 16 products instead of 40, a plain horizontal nav plus a
full-screen overlay on mobile is both simpler and honest to the smaller catalog.

**Layout archetype — rows, not cards.** Replace the card grid on index pages
with full-width media rows: image left, copy right, alternating. Different
rhythm, different scan pattern, better suited to 16 products than to 76.

**Measure and rhythm.** Drop `--maxw` to 1080px, widen `--gutter`, increase
section padding. A more generous, slower page against a denser one.

**Hero.** Any Size leads with a headline block. Lead instead with a full-bleed
photograph and an overlaid card carrying the phone number — a local business
front door rather than a catalog cover.

**Dark mode.** Consider dropping it. A single warm light theme is a legitimate
choice for this kind of business, halves the CSS surface, and removes another
structural similarity. If it stays, make it a warm dark (browns) not a cool one.

Nearly all of this lands in `src/styles/global.css`, where the tokens are
centralised — but do not stop at the tokens. Token-only changes recolour a
design without changing it. The nav, the hero and the card-to-row switch are the
changes that actually alter the shape of the pages.

---

## 5. Architecture reference

Astro 4.16, `output: 'static'`, `build.format: 'directory'`, no runtime
dependencies. Everything is generated at build time from JSON in `src/data/`.

```
src/
  data/          JSON catalog + site.json — all content lives here
  layouts/
    Base.astro   <head>, OG tags, JSON-LD schema, header/footer  ← identity
    Article.astro  prose pages with a sidebar and optional TOC
  components/    Header, Footer, Placeholder
  pages/         file-based routes; [slug].astro files fan out from data
  scripts/       form-submit.js — shared fetch handler for both forms
  styles/        global.css — all design tokens
  lib/images.ts  slug → image path resolution
public/
  img/           225 WebP product photos
  og/            93 link-preview JPEGs, 1200×630
  CNAME          custom domain for GitHub Pages
  .nojekyll      load-bearing, see §2
```

### Data files

| File | Shape | Contents |
|---|---|---|
| `building-types.json` | array[24] | `slug, name, group, headline, intro, detail, useCases, commonSizes, models, specs` |
| `models.json` | array[8] | `code, name, family, profile, summary, spanRange, bestFor, notes` |
| `options.json` | array[2] | `family, familyName, familyIntro, items` |
| `inventory.json` | array[52] | `slug, title, model, width, height, length, sqft, regions, tags, featured` |
| `faqs.json` | array[84] | `category, q, a` — 72 steel, 12 portable |
| `portable-buildings.json` | object | `line, construction, categories, products` (16 products) |
| `locations.json` | object | `base, shared, counties` (8, 74 communities), `cities` (15 detailed) |
| `images.json` | object | `types, inventory, hero, options, portable` |
| `site.json` | object | identity, contact, the two launch flags, form endpoint |

### Things in the codebase that are load-bearing

- **`.nojekyll`** — see §2. Silent total failure without it.
- **OG images must be absolute URLs.** `Base.astro` builds them with `new URL(...)`.
  Social scrapers ignore root-relative paths and simply render no preview.
- **`noindex` is used, not `robots.txt Disallow`.** Blocking the crawl stops
  engines from ever *seeing* the noindex directive, which leaves bare URLs
  indexable and much harder to remove later. `robots.txt.ts` deliberately keeps
  crawling allowed while `indexable` is false and withholds only the sitemap.
- **`sitemap.xml.ts` is hand-rolled.** `@astrojs/sitemap` v3.7.3 crashes against
  Astro 4 (it expects Astro 5's hook signature). The local version generates from
  the same data the pages use, so it cannot drift from real routes. Do not
  reinstall the integration.
- **Inventory slugs must be ASCII.** Prime marks (′) in the source titles produce
  `NoMatchingStaticPathFound` at build time.
- **Floor-plan PNGs are flattened onto white** at download and sit in explicitly
  white containers; they are black line art and vanish in dark mode otherwise.

---

## 6. Deploying to GitHub Pages

The source repo publishes via a `gh-pages` branch, not `actions/deploy-pages`
— the "GitHub Actions" Pages source was not available on this account. Copy
`.github/workflows/deploy.yml` across unchanged; it needs `permissions:
contents: write` and it asserts before publishing that the build produced a
sane page count, a `CNAME`, a `.nojekyll`, an `_astro/` directory and a sitemap.

After the first successful run, the repo owner must set
**Settings → Pages → Branch → `gh-pages` / `(root)` → Save**, signed in. Nothing
is publicly reachable until that switch is thrown, and it cannot be done from
the API on this account.

DNS for the new domain, at the registrar:

```
A     @    185.199.108.153
A     @    185.199.109.153
A     @    185.199.110.153
A     @    185.199.111.153
CNAME www  <github-username>.github.io.
```

Then tick **Enforce HTTPS** once the certificate provisions.

---

## 7. Launch checklist

- [ ] `grep -ril "any size\|anysize" dist/ src/ public/` returns nothing
- [ ] `npm run build` succeeds; page count matches the reduced scope
- [ ] No copy paragraph is shared verbatim with anysize.shop — spot-check ten
- [ ] Separate phone number, live and answered
- [ ] OG images regenerated with the new wordmark; test a link in a real DM
- [ ] Form endpoint set and tested end to end with a real submission
- [ ] Email forwarding live, then `emailPending: false`
- [ ] Privacy and Terms reviewed by someone qualified — the source ships
      templates carrying a visible "remove before launch" note, and they are
      starting points, not legal documents
- [ ] Warranty page reflects the actual manufacturer terms in writing
- [ ] Financing figures confirmed against the current program before publishing
- [ ] Google Business Profile created at the **new phone number**
- [ ] `indexable: true` — last step

---

## 8. Handover note for the new session

Everything about identity flows from `src/data/site.json`. Start there, get a
clean build, and only then begin the design work — a rebrand and a redesign
attempted in the same pass produces a build you cannot bisect.

The two flags in that file, `indexable` and `emailPending`, are what keep an
unfinished site from being indexed or from publishing a dead mailbox. Leave both
set until the checklist above is genuinely complete.
