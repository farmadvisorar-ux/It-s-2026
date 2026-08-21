# Marshall Sheds

Marketing and catalog site for Marshall Sheds, an independent authorized dealer
carrying two lines:

- **Engineered steel buildings** — bolt-together kits, engineered per site, shipped nationwide.
- **Wood portable buildings** — built complete and delivered finished, within a
  six-state regional area (TX, LA, MO, IL, TN, IN).

The two are kept deliberately separate throughout. They are different products
sold to different buyers with different constraints, and conflating them in the
copy would mislead people about delivery area, foundations and permitting.

Built with [Astro](https://astro.build) as a static site. 160 pages, no runtime
dependencies, deploys anywhere that serves static files.

**Pre-launch.** `indexable`, `phonePending` and `emailPending` in
`src/data/site.json` are all set so the site carries `noindex` and publishes
neither a phone number nor a mailbox until real ones exist. See
[Before launch](#before-launch--required).

---

## Running locally

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # outputs to dist/
npm run preview  # serve the built site
```

## Deploying to Vercel

`vercel.json` pins the framework, build command and output directory.

1. Push this repo to GitHub.
2. In Vercel, **Add New → Project**, import the repo.
3. Framework preset should read **Astro**. Build command `npm run build`, output `dist`.
4. Add the environment variables below, then deploy.

There is deliberately **no GitHub Pages workflow** on this branch. The default
branch of this repository publishes a different site to `gh-pages` under its own
custom domain, and a Pages workflow here would push this build over it.

## Environment variables

| Variable | Required | What it does |
|---|---|---|
| `PUBLIC_FORM_ENDPOINT` | Yes, to receive leads | URL the quote and contact forms POST to |
| `PUBLIC_SITE_URL` | At launch | Canonical origin, e.g. `https://marshallsheds.com`. Falls back to the Vercel URL, which is fine while the site is `noindex` and wrong the moment it is not |

Until `PUBLIC_FORM_ENDPOINT` is set, both forms validate normally but show a
"not connected" notice instead of pretending a submission was sent. **Set this
before launch or you will silently lose every enquiry.**

Any of these work with a static deploy:

- **Formspree** — `https://formspree.io/f/xxxxxxx` (**a new form, not one shared
  with another site** — the endpoint is public in the page source, and reusing
  one mixes both sites' leads into a single inbox)
- **Web3Forms** — `https://api.web3forms.com/submit` (add a hidden `access_key` field)
- **Your own** Vercel serverless function at `/api/quote`

---

## Editing content

All content lives in `src/data/` as JSON. No code changes needed to update the catalog.

| File | Contents |
|---|---|
| `site.json` | Business name, phone, email, address, hours, dealer notice |
| `building-types.json` | The 24 building categories — copy, specs, sizes, models |
| `models.json` | The 8 building profiles (A, B, C, R, S, T, X, M) |
| `options.json` | Options & finishes catalog for arch and straight-wall |
| `inventory.json` | 52 clearance listings with dimensions and regions |
| `portable-buildings.json` | The 16 portable models, construction spec, warranty, financing, delivery states |
| `faqs.json` | 84 FAQ entries, grouped by category |
| `images.json` | Maps content slugs to photo files |

### Before launch — required

- [ ] **Get the site its own phone number.** A Google Business Profile already
      exists for the other operation at this address. Google resolves business
      identity by address *plus* phone, so a second profile on the same number
      is filed as a duplicate and suspended — the listing stops existing, which
      is not a ranking effect you can optimise around. A second number takes
      minutes to provision. Put it in `site.json` and set `phonePending` to
      `false`; the header, footer, contact page, schema and form messages all
      pick it up from there.
- [ ] **Fill in `site.json`** — phone and the three email addresses are blank.
      Set `phonePending` / `emailPending` to `false` once each is live. Until
      then nothing publishes a number or a mailbox that does not answer.
- [ ] **Set `PUBLIC_FORM_ENDPOINT`** so the forms actually deliver.
- [ ] **Warranty page** (`src/pages/about/warranty.astro`) — fill in the real terms
      from your dealer agreement and remove the red publish note. Do not publish
      specific durations you have not confirmed in writing.
- [ ] **Privacy and Terms** (`src/pages/privacy.astro`, `terms.astro`) — templates
      only. Have them reviewed, then remove the red publish notes.
- [ ] **Set your own pricing.** Inventory pages currently say "Request pricing".
      As a dealer you set your own margins — add a `price` field to
      `inventory.json` and surface it if you want prices shown publicly.
- [ ] **Get the image permission in writing** if you have not already. The
      photos are the manufacturer's copyright and the permission is what makes
      their use here lawful; an email on file costs nothing and settles it.
- [ ] **Confirm the portable delivery states** (`portable-buildings.json` →
      `line.deliveryStates`). It is stated prominently on every product page and
      on the homepage, so it needs to be right.
- [ ] **Confirm financing terms.** Rates and programs are the finance providers',
      not ours, and they change. Verify before launch and re-check periodically.
- [ ] **Set `PUBLIC_SITE_URL`** to the real domain so canonical URLs, the
      sitemap and the OG image URLs are right. The fallback in
      `astro.config.mjs` is the Vercel hostname.
- [ ] **Regenerate the link previews** — `node scripts/og.mjs` — if you change
      the tagline, add catalog entries or swap photography.
- [ ] **Keep the two operations unlinked.** No cross-link in either footer, a
      separate analytics property or none, WHOIS privacy on at the registrar,
      and a separate Business Profile on the new number.
- [ ] **Flip `indexable` to `true`** last, once everything above is done.

## Images

Photos come from the manufacturer's media library and are used with their
permission (confirmed by the dealer). They are downloaded, resized and
converted to WebP at build-prep time and served from `public/img/` — nothing
is hotlinked, so the site has no runtime dependency on the manufacturer.

| Folder | Count | Used for |
|---|---|---|
| `public/img/types/` | 69 | Building-type heroes, cards, and per-page galleries |
| `public/img/inventory/` | 52 | One photo per clearance listing |
| `public/img/options/` | 8 | Options & finishes pages |
| `public/img/portable/` | 66 | Portable model heroes and galleries |
| `public/img/portable/plans/` | 22 | Floor plan drawings, keyed by plan number |
| `public/img/portable/details/` | 4 | Construction detail shots |
| `public/img/portable/colors.webp` | 1 | Paint / shingle / metal roof chart |

Four options pages (foundations, roof accessories, trim & flashing,
straight-wall insulation) intentionally still use placeholders — see the
screening notes below.

### Screening

Every downloaded image was reviewed on a contact sheet before use. These were
**deliberately excluded** and should not be reinstated without a good reason:

- **Four photos of identifiable people** — three of the same man in a blazer
  with a logo lapel pin, plus one selfie. Publishing them here implies those
  people represent Marshall Sheds.
- **Two photos carrying another company's identity** — service vans liveried
  for an unrelated firm, and a building with "HARRISON DISTRIBUTING" signage
  across the front, which would imply a customer relationship that does not
  exist.
- **One photo with rental-company branding** on a lift (Sunbelt Rentals).
- **Several unusable frames** — a cropped instructional graphic with cut-off
  text, pixelated gutter renders, and two blurry aerials.
- From the portable-building set: the **manufacturer logo**, site UI chrome
  (menu icon, slider arrows), and a **photo of a person**. 61 references in
  total were skipped on those rules.

If you add images later, screen for the same three things: identifiable
people, third-party branding or signage, and any visible manufacturer mark.

### Floor plans are flattened onto white — do not undo this

The floor plan drawings arrived as PNGs with transparent backgrounds and black
line art. Served as-is they disappear against any non-white ground — including
this site's bone `--bg`. They are flattened onto a white background at download
time and their container is explicitly `background: #fff`. If you replace them,
flatten them the same way.

### Swapping in your own photography

`src/data/images.json` maps content to files. Replace a file in `public/img/`
keeping the same name and nothing else needs to change. To add a photo where
one is missing, drop the file in and add its path to `images.json` — the
`Placeholder` component falls back to a styled placeholder whenever a path is
absent, so partial coverage always renders cleanly.

---

## Content notes

This site was built as an independent dealer storefront. Two deliberate decisions
worth preserving if you extend it:

**All copy is original.** Product facts — model designations, dimensions, spans,
material properties — are factual and freely usable. The prose describing them was
written for this site. Beyond the copyright question, duplicate text is actively
harmful for SEO: search engines dedupe it, and a newer dealer domain loses that
comparison to the manufacturer's established one every time.

**The site does not claim to be the manufacturer.** Marshall Sheds is an
independent authorized dealer. Copy consistently says "our manufacturing partner" rather than "we
manufacture", because the latter would be inaccurate. Keep that distinction if you
add pages.

**There are no testimonials.** A testimonials section was deliberately left out
rather than populated with borrowed reviews. Add real ones as customers give them.

**No photo shows an identifiable person or another company's branding.** See
the screening notes under Images — this was checked deliberately, not by luck.

**Component brands are named; manufacturer brands are not.** The portable
buildings pages name LP SmartSide siding and Glidden paint, because those are
factual component specs, they are what the buildings are actually built from,
and buyers recognise them — LP SmartSide's 50-year warranty is a selling point.
Neither building manufacturer is named anywhere. If you would rather drop the
component names too, they live in `portable-buildings.json` under
`construction` and are a one-line edit.

**The two lines are never blurred.** Portable buildings state their six-state
delivery area on every product page, the homepage and the line index. Specialty
models flag their 1-year warranty rather than inheriting the 5-year term. Steel
pages say kits ship nationwide. Keep those distinctions if you extend the site —
they are the facts most likely to cause a complaint if they are wrong.

## Structure

```
src/
├── data/           JSON content — edit here
├── layouts/        Base.astro, Article.astro
├── components/     Header, Footer, Placeholder
├── pages/
│   ├── building-types/   index + [...slug] → 24 pages  (steel)
│   ├── portable-buildings/  index + [slug] → 16 pages  (wood)
│   ├── models/           index + [code] → 8 pages
│   ├── inventory/        index + [slug] → 52 pages
│   ├── options-and-finishes/  index + [family]/[slug] → 12 pages
│   ├── resources/        6 guides + FAQ
│   ├── about/            about, advantage, warranty, pricing
│   ├── quote.astro       lead form with prefill
│   └── contact.astro
└── styles/global.css     design tokens — one warm light theme
```

## Link previews

`public/og/` holds 93 Open Graph cards, 1200×630 JPEG, one per indexed detail
page plus a default. They are generated, not hand-made:

```bash
node scripts/og.mjs
```

The script reads `src/data/images.json`, so a card always uses a photo the page
itself shows, and it pulls Bitter and Source Sans 3 into `.cache/fonts` on first
run so the cards use the same faces as the site. Re-run it after changing the
tagline, adding catalog entries or swapping photography.

`Base.astro` builds the `og:image` value as an **absolute** URL. Scrapers ignore
root-relative paths and render no preview at all, which is why `PUBLIC_SITE_URL`
matters at launch.

## Design

Warm bone ground, warm charcoal text, barn-red accent. Bitter (serif) for
headings against Source Sans 3 for body copy. Soft radii, tonal background steps
instead of hairline borders, and one light theme — there is deliberately no dark
mode.

Index pages use **alternating media rows** (`.rows` / `.rows--compact` in
`global.css`), not card grids. The header carries a plain horizontal nav with a
full-screen overlay on narrow screens; the category depth that a mega menu would
hold lives on the homepage directory and the index pages instead.
