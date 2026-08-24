# Marshall Sheds — build brief

**The job:** clone the Any Size site in full, rebrand it to Marshall Sheds, and
stand it up on its own domain as a completely separate operation. Same catalog,
same photography, same architecture. The clone may stay as close to the source
as it likes — visual divergence is explicitly not a goal. Nothing links the two
sites.

> **Status.** The first pass is built and lives at
> `https://github.com/farmadvisorar-ux/marshall-sheds` — fresh history, 378
> files, no CNAME, no Pages workflow, so it cannot reach `anysize.shop`. This
> file is now reference rather than instructions: read §0 and §5 before touching
> anything, since those carry the two constraints that still bind. Then read
> §2a — the fork was taken before several real bugs were found in the source;
> those fixes have since been ported across, and §2a is the record of what and
> why.

Source repo: `https://github.com/farmadvisorar-ux/It-s-2026`
Source site: Any Size — `anysize.shop` (Astro 4, static, 159 pages)

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

**2. The two sites will compete on search, and the owner has accepted that.**
Google picks one URL per duplicated passage and suppresses the other, so with
the same catalog on both domains the two will collide on many of the same
queries — and Any Size is the one holding the established Business Profile.

This was raised and decided: the clone stays close. Do not reopen it, do not
quietly rewrite copy to hedge against it, and do not treat divergence as a
requirement anywhere in this build. Recorded here only so nobody rediscovers it
as a surprise later.

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
npm run build        # 159 pages — both sides match since the §2a ports
```

Get a clean build first. Do not debug a broken build and a rebrand at the same
time.

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
`noindex` on every page; the second hides the email address everywhere
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

## 2a. Fixes made after the fork — ported, done

**All of this is already applied in the `marshall-sheds` repo** (commit
`59586e4`). Kept here as the record of what those changes were and why, so
nobody re-derives them or assumes the fork is still behind. Nothing to do.

The fork was taken at commit `ecd1727`. Real bugs were found in the source
afterwards and fixed there. None of them announce themselves; each was found by
auditing the built site, not by anything failing.

**Forms posted nowhere.** `deploy.yml` passes `PUBLIC_FORM_ENDPOINT` from an
Actions variable that does not exist. GitHub interpolates a missing variable as
an empty string rather than leaving it unset, and both form pages coalesced with
`??`, which only falls through on null and undefined — so `""` beat the real
endpoint and every submission from the deployed site was silently dropped.
Local builds were fine, which is what hid it. Fixed with `||` and a trim. In
the fork it was masked only because `formEndpoint` is blank, and would have
bitten the moment a real one was set.

**Duplicate inventory record.** `40-x-40-container-cover-usa` is byte-identical
to `40-x-40-container-cover` in every field but the slug — an extraction
artifact that publishes the same page at two URLs. Removed on both sides — 52
records down to 51.

**Titles and descriptions past what Google prints.** 23 titles over 60
characters and 25 descriptions over 160, almost all on service-area pages, plus
two pairs of pages sharing a title. `scripts/check-meta.mjs` fails a build on
any of it and now runs on both sides — inside `buildCommand` in the fork, since
Vercel has no separate verify stage. It caught six further overruns there that
do not exist in the source, because "Marshall Sheds" is six characters longer
than "Any Size" and pushes borderline titles over.

**Region in inventory titles.** Two kits differing only in where they sit shared
a title. Non-US regions now appear in the title, which is freight-relevant
anyway.

The `[hidden]`/`display` bug was found independently during the fork, but the
fix there listed `.row` and `.card` by name — which covered the inventory filter
and missed the quote form, whose conditional field is a `.field`. Both sides now
match the attribute itself rather than an enumerated list.

---

## 3. Copy

Copy the catalog across as-is. All of it transfers: 24 steel building types,
8 model profiles, 12 option items, 51 clearance listings, 84 FAQs, 16 portable
buildings, the location data, all 225 photos.

Two things must change regardless of how much text is reused:

- **Manufacturer identity.** The copy says "our manufacturing partner", never
  "we manufacture". The owner is a dealer. Any wording that implies otherwise is
  a false claim about who built the building, and it carries real liability when
  a customer relies on it.
- **Anything naming or implying Any Size.** Caught by the grep sweep in §2.

Nothing else needs rewriting. The owner has decided the clone stays close, so
the catalog prose ships as it stands — the two edits above are the whole
requirement.

**Do not add testimonials or reviews.** There are none in the source. Inventing
social proof for a new brand is fabrication, and review fraud is separately
illegal.

---

## 4. Interface

**Not a requirement.** The owner has said the clone can stay as close to the
source as it needs to be, so no amount of visual divergence is being asked for.
Do not spend a build cycle redesigning to hit a similarity target that does not
exist.

What is already in the repo, from the first pass, is a genuine redesign: bone
ground with a barn-red accent, Bitter over Source Sans 3 instead of single-family
Inter, softer radii, the two mega menus replaced with a plain nav plus a
full-screen mobile overlay, index pages built from alternating media rows rather
than card grids, a 1080px measure, and no dark mode.

Keep it or revert it — both are fine and neither affects anything else in this
brief. Reverting means taking `src/styles/global.css`, `src/components/Header.astro`,
`src/components/Footer.astro` and `src/pages/index.astro` from the source repo
and re-running the §2 brand sweep over them. Everything else is already shared.

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
- [ ] `npm run build` succeeds and the page count matches the source
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
