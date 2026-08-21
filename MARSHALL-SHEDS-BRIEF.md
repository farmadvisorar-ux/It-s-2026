# Marshall Sheds — build brief

Hand this file to a fresh Claude Code session in the new project box.

**The job:** clone the Any Size site in full, rebrand it to Marshall Sheds, give
it a visibly different interface, and stand it up on its own domain as a
completely separate operation. Same catalog, same photography, same
architecture. Nothing links the two sites.

Source repo: `https://github.com/farmadvisorar-ux/It-s-2026`
Source site: Any Size — `anysize.shop` (Astro 4, static, 160 pages)

Everything in the source is the owner's own work — the code, the copy, and the
manufacturer photography he is licensed to use. There is no permission question
in reusing any of it.

---

## 0. Two facts to build around

**1. The new site needs its own phone number.** A Google Business Profile
already exists for Any Size at (903) 690-5969, 360 PR 1031, Marshall TX 75672.
Google allows one profile per business entity and resolves entities by address
plus phone, so a second profile on that same number is filed as a duplicate and
suspended. This is not a ranking effect to be optimised around — the listing
stops existing. Google Voice issues a free second number in minutes. Sharing the
building is fine; sharing the phone is not.

Without its own number Marshall Sheds still works as a website, but it cannot
hold a Business Profile: no map pack, no "near me" results, no reviews.

**2. Identical copy on two sites competes with itself.** Google picks one URL
per duplicated passage and suppresses the other. With the same catalog on both
domains, the two sites will collide on many of the same searches, and Any Size
is the one holding the established Business Profile.

The cheap fix, if it is wanted later, is in §3 — it is an automated pass, not
weeks of writing. The clone is built either way; this is noted so it is a choice
rather than a surprise.

**Verified NAP for the source — do not retype from memory:**

```
360 PR 1031, Marshall, TX 75672
```

Marshall has three ZIPs: 75670 and 75672 for street delivery, 75671 for PO
Boxes. 75673 does not exist here and has been mistyped once already.

---

## 1. Get the code

```bash
git clone https://github.com/farmadvisorar-ux/It-s-2026.git marshall-sheds
cd marshall-sheds
rm -rf .git dist
git init && git add -A && git commit -m "Fork Any Size codebase as Marshall Sheds"
npm install
npm run dev          # http://localhost:4321
npm run build        # must report 160 pages before you change anything
```

Get a clean 160-page build first. Do not debug a broken build and a rebrand at
the same time.

---

## 2. Rebrand — mechanical

**`src/data/site.json`** is the single source of truth for identity. Every page
reads it, so this one file drives the footer, the contact page, the JSON-LD
schema and the OG tags together.

```json
{
  "name": "Marshall Sheds",
  "tagline": "<new tagline>",
  "description": "<new description>",
  "phone": "(903) XXX-XXXX",
  "phoneRaw": "+1903XXXXXXX",
  "email": "info@<newdomain>",
  "emails": { "info": "...", "sales": "...", "quotes": "..." },
  "address": { "street": "360 PR 1031", "city": "Marshall", "region": "TX", "postal": "75672", "country": "USA" },
  "hours": "Mon–Fri 8:00am–6:00pm",
  "dealerNotice": "<reworded>",
  "indexable": false,
  "emailPending": true,
  "formEndpoint": "<new Formspree endpoint — see §5>"
}
```

`indexable: false` and `emailPending: true` are safety flags. The first puts
`noindex` on all 160 pages; the second hides the email address everywhere
including the schema. Flipping them is the last step of the project.

| File | Change |
|---|---|
| `package.json` | `"name": "marshall-sheds"` |
| `astro.config.mjs` | `site: 'https://<newdomain>'` |
| `public/CNAME` | new domain, one line, no protocol |
| `src/layouts/Base.astro` | the `new URL('https://anysize.shop')` origin fallback |
| `src/components/Header.astro` | brand SVG mark + `<strong>Any</strong> Size` wordmark |
| `src/components/Footer.astro` | same wordmark |
| `src/scripts/form-submit.js` | hardcoded phone in two fallback strings |
| `src/pages/quote.astro` | hardcoded phone in `successBody` |
| `src/pages/contact.astro` | hardcoded phone in `successBody` |
| `README.md` | rewrite for the new brand |
| `public/og/*` | regenerate — 93 images carry the old wordmark |

**Keep `public/.nojekyll`.** GitHub Pages runs Jekyll, Jekyll ignores any path
starting with an underscore, and Astro emits all CSS and JS into `_astro/`.
Without that file the site deploys successfully and renders with zero styling
and no error anywhere. The workflow asserts it for this reason.

**Sweep — must return nothing:**

```bash
npm run build
grep -ril "any size\|anysize" dist/ src/ public/ --exclude-dir=node_modules
```

---

## 3. Copy

Copy the catalog across as-is. All of it transfers: 24 steel building types,
8 model profiles, 12 option items, 52 clearance listings, 84 FAQs, 16 portable
buildings, the location data, all 225 photos.

Two things must change regardless of how much text is reused:

- **Manufacturer identity.** The copy says "our manufacturing partner", never
  "we manufacture". The owner is a dealer. Any wording that implies otherwise is
  a false claim about who built the building, and it carries real liability when
  a customer relies on it.
- **Anything naming or implying Any Size.** Caught by the grep sweep in §2.

**Optional rewrite pass.** If the duplicate-content collision in §0 is worth
avoiding, it costs one automated pass rather than weeks of writing: walk each
data file, rewrite every `intro`, `detail`, `headline`, `summary` and FAQ answer
in a different voice, and write the result back. The source is written flat and
technical — spans, gauges, load values, no adjectives. A plainer, more
conversational second-person register is a genuinely different voice and gives
each site its own set of pages to rank. Roughly an hour of tool calls. Worth
raising with the owner once, then doing whichever he picks.

**Do not add testimonials or reviews.** There are none in the source. Inventing
social proof for a new brand is fabrication, and review fraud is separately
illegal.

---

## 4. Interface — make it visibly different

The brief here is that a visitor seeing both sites should not read them as one
template used twice. Recolouring the tokens does not achieve that; the shape of
the pages has to change.

### What the source is, and is moving away from

Cool steel-gray palette with a warm amber accent. Inter throughout, tight
letter-spacing. 4px and 8px radii. Sticky translucent header carrying two
six-column mega menus. Card grids on every index page. 1200px measure.
Automatic dark mode. It reads industrial, dense, catalog-like.

### Direction for Marshall Sheds

**Palette — warm, not cool.** Bone or cream ground (`#faf7f2`), warm charcoal
text (`#2b2622`), barn-red or deep-forest accent. Warm-versus-cool ground reads
instantly at a glance, which is the test being applied.

**Type — two families, not one.** A serif for headings (Bitter, Zilla Slab or
Fraunces — all on Google Fonts, the only external host the CSP allows) against a
humanist sans for body. The source is single-family Inter; a serif/sans pairing
is a different design language, not a different setting.

**Shape — soft, not sharp.** Radii to 12–16px, warmer and softer shadows, 1px
borders replaced by tonal background steps.

**Navigation — remove the mega menu.** It is the single most recognisable
element of the source. Replace with a plain horizontal nav plus a full-screen
overlay on mobile, and push the category depth onto the index pages.

**Layout archetype — rows, not cards.** Replace card grids on index pages with
full-width media rows, image alternating left and right. Different rhythm,
different scan pattern.

**Measure and rhythm.** `--maxw` down to 1080px, wider `--gutter`, more section
padding. A slower, more generous page against a denser one.

**Hero.** The source leads with a headline block. Lead instead with a full-bleed
photograph and an overlaid card carrying the phone number.

**Dark mode.** Consider dropping it — a single warm light theme is a legitimate
choice, halves the CSS surface, and removes another structural tell. If kept,
make it a warm dark (browns), not a cool one.

Most tokens live in `src/styles/global.css`. Do not stop there: token-only edits
recolour a design without changing it. The nav, the hero, and the card-to-row
switch are what actually change the shape of the pages.

---

## 5. Keeping the two operations separate

"Separate" is an infrastructure property, not a styling one. Each item below
otherwise ties the two sites together in a way that is publicly visible.

| Thing | Why it matters | Action |
|---|---|---|
| Phone number | Merges the Business Profiles — §0 | New number, mandatory |
| Form endpoint | The current Formspree endpoint is in `site.json` and public in page source. Reusing it mixes both sites' leads into one inbox | New Formspree form |
| Email | Shared mailbox links the brands in every reply header | New addresses on the new domain |
| Analytics | A shared property ties the domains together in one account | Separate property, or none |
| Cross-links | A "sister site" link in either footer connects them permanently | None, in either direction |
| `og:site_name`, schema `name` | Machine-readable identity in every page | Driven by `site.json`; verify after rebrand |
| WHOIS | Public registrant details link the domains | Registrar privacy on |
| Business Profile | One per entity | Separate listing, new number |

Shared GitHub account and shared hosting are not publicly visible and do not
matter.

---

## 6. Architecture reference

Astro 4.16, `output: 'static'`, `build.format: 'directory'`, no runtime
dependencies. Everything generates at build time from JSON in `src/data/`.

```
src/
  data/          JSON catalog + site.json — all content lives here
  layouts/
    Base.astro   <head>, OG tags, JSON-LD schema, header/footer  ← identity
    Article.astro  prose pages with sidebar and optional TOC
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

| File | Shape | Keys |
|---|---|---|
| `building-types.json` | array[24] | `slug, name, group, headline, intro, detail, useCases, commonSizes, models, specs` |
| `models.json` | array[8] | `code, name, family, profile, summary, spanRange, bestFor, notes` |
| `options.json` | array[2] | `family, familyName, familyIntro, items` |
| `inventory.json` | array[52] | `slug, title, model, width, height, length, sqft, regions, tags, featured` |
| `faqs.json` | array[84] | `category, q, a` — 72 steel, 12 portable |
| `portable-buildings.json` | object | `line, construction, categories, products` (16 products) |
| `locations.json` | object | `base, shared, counties` (8, 74 communities), `cities` (15 detailed) |
| `images.json` | object | `types, inventory, hero, options, portable` |
| `site.json` | object | identity, contact, launch flags, form endpoint |

### Load-bearing details that fail silently

- **`.nojekyll`** — see §2. Total styling loss, no error.
- **OG images must be absolute URLs.** `Base.astro` builds them with `new URL(...)`.
  Scrapers ignore root-relative paths and render no preview at all.
- **`noindex`, not `robots.txt Disallow`.** Blocking the crawl stops engines from
  ever seeing the noindex directive, leaving bare URLs indexable and much harder
  to remove. `robots.txt.ts` keeps crawling allowed while `indexable` is false
  and withholds only the sitemap.
- **`sitemap.xml.ts` is hand-rolled.** `@astrojs/sitemap` v3.7.3 crashes on
  Astro 4 — it expects Astro 5's hook signature. The local version generates from
  the same data as the pages, so it cannot drift. Do not reinstall the integration.
- **Inventory slugs must be ASCII.** Prime marks (′) in source titles cause
  `NoMatchingStaticPathFound` at build time.
- **Floor-plan PNGs are flattened onto white** and sit in explicitly white
  containers — black line art, invisible in dark mode otherwise.
- **The two product lines stay distinct.** Steel kits ship nationwide and need a
  foundation and permits; portable buildings arrive finished in six states.
  Different delivery areas, warranties and foundations. Merging the copy
  misleads people about all three.

---

## 7. Deploy — GitHub Pages

The source publishes via a `gh-pages` branch rather than `actions/deploy-pages`;
the "GitHub Actions" Pages source is not available on this account. Copy
`.github/workflows/deploy.yml` across unchanged. It needs `permissions: contents:
write` and asserts before publishing that the build produced a sane page count,
a `CNAME`, a `.nojekyll`, an `_astro/` directory and a sitemap.

After the first green run the owner must set **Settings → Pages → Branch →
`gh-pages` / `(root)` → Save**, signed in. Nothing is publicly reachable until
that switch is thrown, and it cannot be done via API on this account.

Registrar DNS for the new domain:

```
A     @    185.199.108.153
A     @    185.199.109.153
A     @    185.199.110.153
A     @    185.199.111.153
CNAME www  <github-username>.github.io.
```

Tick **Enforce HTTPS** once the certificate provisions.

---

## 8. Launch checklist

- [ ] `grep -ril "any size\|anysize" dist/ src/ public/` returns nothing
- [ ] `npm run build` reports 160 pages
- [ ] Own phone number, live and answered
- [ ] Own Formspree endpoint, tested with a real submission end to end
- [ ] Email forwarding live, then `emailPending: false`
- [ ] OG images regenerated; test a real link in a DM before trusting it
- [ ] No cross-link to anysize.shop anywhere, in either direction
- [ ] Registrar WHOIS privacy on
- [ ] No copy claims or implies the owner manufactures the buildings
- [ ] Privacy and Terms reviewed by someone qualified — the source ships
      templates carrying a visible "remove before launch" note. They are
      starting points, not legal documents
- [ ] Warranty page matches the manufacturer's actual written terms
- [ ] Financing figures confirmed against the current program
- [ ] Google Business Profile created on the **new number** — using
      (903) 690-5969 gets it suspended as a duplicate of Any Size
- [ ] `indexable: true` — last step

---

## 9. Handover note

Identity flows from `src/data/site.json`. Start there, get a clean build, then
do the interface work as a separate pass. A rebrand and a redesign in one pass
produces a build you cannot bisect.

`indexable` and `emailPending` are what keep an unfinished site out of the index
and stop it publishing a mailbox that does not receive. Leave both set until the
checklist above is genuinely done.
