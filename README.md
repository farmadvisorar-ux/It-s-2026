# Marshall Sheds

Marketing and catalog site for Marshall Sheds, an authorized independent dealer of
pre-engineered steel buildings.

Built with [Astro](https://astro.build) as a static site. 119 pages, no runtime
dependencies, deploys anywhere that serves static files.

---

## Running locally

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # outputs to dist/
npm run preview  # serve the built site
```

## Deploying to Vercel

Vercel auto-detects Astro — no `vercel.json` needed.

1. Push this repo to GitHub.
2. In Vercel, **Add New → Project**, import the repo.
3. Framework preset should read **Astro**. Build command `npm run build`, output `dist`.
4. Add the environment variable below, then deploy.

## Environment variables

| Variable | Required | What it does |
|---|---|---|
| `PUBLIC_FORM_ENDPOINT` | Yes, to receive leads | URL the quote and contact forms POST to |

Until `PUBLIC_FORM_ENDPOINT` is set, both forms validate normally but show a
"not connected" notice instead of pretending a submission was sent. **Set this
before launch or you will silently lose every enquiry.**

Any of these work with a static deploy:

- **Formspree** — `https://formspree.io/f/xxxxxxx`
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
| `faqs.json` | 70 FAQ entries, grouped by category |

### Before launch — required

- [ ] **Fill in `site.json`** — phone, email and address are blank. They appear on
      the contact page and in the footer automatically.
- [ ] **Set `PUBLIC_FORM_ENDPOINT`** so the forms actually deliver.
- [ ] **Warranty page** (`src/pages/about/warranty.astro`) — fill in the real terms
      from your dealer agreement and remove the red publish note. Do not publish
      specific durations you have not confirmed in writing.
- [ ] **Privacy and Terms** (`src/pages/privacy.astro`, `terms.astro`) — templates
      only. Have them reviewed, then remove the red publish notes.
- [ ] **Set your own pricing.** Inventory pages currently say "Request pricing".
      As a dealer you set your own margins — add a `price` field to
      `inventory.json` and surface it if you want prices shown publicly.
- [ ] **Update `site` in `astro.config.mjs`** to your real domain (currently
      `marshallsheds.com`) so canonical URLs and the sitemap are correct.

## Images

Every image on the site is a styled placeholder rendered by
`src/components/Placeholder.astro`. Nothing is hotlinked and no third-party
photography is used.

To add real photos:

```astro
<!-- before -->
<Placeholder label="Steel Garages" />

<!-- after -->
<Placeholder label="Steel Garages" src="/img/garages.jpg" alt="30x40 steel garage" />
```

Drop files in `public/img/`. Layout does not change — the placeholder and the real
image occupy the same box.

---

## Content notes

This site was built as an independent dealer storefront. Two deliberate decisions
worth preserving if you extend it:

**All copy is original.** Product facts — model designations, dimensions, spans,
material properties — are factual and freely usable. The prose describing them was
written for this site. Beyond the copyright question, duplicate text is actively
harmful for SEO: search engines dedupe it, and a newer dealer domain loses that
comparison to the manufacturer's established one every time.

**The site does not claim to be the manufacturer.** Marshall Sheds is an authorized
dealer. Copy consistently says "our manufacturing partner" rather than "we
manufacture", because the latter would be inaccurate. Keep that distinction if you
add pages.

**There are no testimonials.** A testimonials section was deliberately left out
rather than populated with borrowed reviews. Add real ones as customers give them.

## Structure

```
src/
├── data/           JSON content — edit here
├── layouts/        Base.astro, Article.astro
├── components/     Header, Footer, Placeholder
├── pages/
│   ├── building-types/   index + [...slug] → 24 pages
│   ├── models/           index + [code] → 8 pages
│   ├── inventory/        index + [slug] → 52 pages
│   ├── options-and-finishes/  index + [family]/[slug] → 12 pages
│   ├── resources/        6 guides + FAQ
│   ├── about/            about, advantage, warranty, pricing
│   ├── quote.astro       lead form with prefill
│   └── contact.astro
└── styles/global.css     design tokens, light + dark
```
