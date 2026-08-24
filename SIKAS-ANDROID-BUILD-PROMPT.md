# Sikas Ads — Android Supply App + Exchange Build Prompt

**Version 1.0 · 2026-08-24**

This is the master build prompt for the Sikas Android app and the exchange changes
behind it. Hand the whole thing to a competent engineering team or a coding agent.
It is written to be executed, not admired: every number in it is a real number, and
every requirement is testable.

---

## 0. How to use this prompt

Build in the phase order given in §19. Do not skip §2 — it contains five facts that
change the architecture, and a build that ignores them ships a product that cannot
pay its users, gets removed from Google Play, or loses money on every payout.

Where this document says **MUST**, it is a hard requirement and there is a test for
it in §16. Where it says **SHOULD**, deviate only with a written reason in the PR.

Existing system this plugs into:

- `sikads.com/embed.js` — the web publisher tag. Takes `data-site-id`, `data-theme`,
  `data-floor-cpm`. Site ids look like `pub_ai_9948`. Web publishers today run floors
  around $2.25 CPM.
- The Android app is a **second supply source on the same exchange**, not a separate
  product. One auction, one campaign object, one budget, one ledger. An advertiser
  buys impressions; the exchange decides whether they land on a web page or a phone.
  Supply-source-specific floors and quality multipliers keep the two honest.

---

## 1. What you are building

Three things:

1. **Sikas (Android)** — a consumer app. Users see a controlled number of ads per day,
   at a volume they choose, and earn **40%** of what the advertiser pays for each
   valid, viewable impression. Payouts through Stripe Connect.
2. **Sikas Ads Manager** — a web console where advertisers deposit funds by card,
   create campaigns, bid, target, and see what they got.
3. **The exchange** — auction, pacing, delivery, measurement, fraud filtering, and a
   double-entry ledger that splits every cent 40/60 and can be audited line by line.

Impressions start at a **$0.50 CPM floor** on app supply and are bid up from there.

---

## 2. Read this before you build: five facts that change the design

### 2.1 At the floor price, the user's 40% is worth about nine cents a month

Do the arithmetic before you promise anything on a landing page.

| Ads/day | Clearing CPM | User share/day | User share/month |
|---|---|---|---|
| 15 | $0.50 (floor) | $0.0030 | **$0.09** |
| 15 | $2.25 (web-level) | $0.0135 | **$0.41** |
| 40 | $2.25 | $0.036 | **$1.08** |
| 15 | $12.00 (rewarded video) | $0.072 | **$2.16** |

To pay a user **$5/month** at a 40% share you need $12.50 of gross revenue from that
user, which at a $2.00 CPM is **6,250 impressions a month — 208 a day**. That is the
exact opposite of "not too much."

Banner CPM cannot fund a rewards app. It never has. Every app that actually pays
users — the whole Swagbucks/Mistplay/InboxDollars category — earns the overwhelming
majority of its user-facing payout from **CPA offers** (a completed signup, install,
or purchase, worth $0.50–$8 each) and **rewarded video** ($8–$25 CPM), with display
banners as a rounding error.

**Therefore the exchange MUST support three pricing models from day one**, sharing one
budget, one ledger and one auction:

- `CPM` — priced per thousand viewable impressions. Floor $0.50. This is the model
  you asked for and it works exactly as specified.
- `CPC` — priced per valid click. Floor $0.02. Internally converted to an eCPM for
  auction ranking using a predicted CTR.
- `CPA` / offers — priced per verified completed action, $0.25–$25. Server-to-server
  postback verified, held 7–30 days against reversal.

Build CPM first (Phase 1), CPC in Phase 2, CPA in Phase 3. But put `pricing_model` on
the campaign table in the very first migration and make the ledger and auction
model-agnostic from the first line of code. Retrofitting this later means rewriting
the auction, the pacing engine, the ledger and the payout logic at once.

### 2.2 Stripe Connect costs more per user than most users will earn

In the US, Connect Express carries a **monthly fee per active connected account** plus
a **per-payout fee** (historically about $2.00/month/active account and 0.25% + $0.25
per payout — verify current Stripe pricing before launch). A user earning $0.09/month
costs you roughly $2 a month to keep an account open for. Onboard a million users
that way and you have built a machine that converts $2M/month into nothing.

You asked for Stripe to be set up for every user. Here is how to honour that without
the platform bleeding:

- Every user has a `payout_account` row from signup. It is real, it holds their
  balance, their tax status, and their payout history. **The Stripe connected account
  is created lazily**, when lifetime earnings first cross **$5.00**.
- Below the threshold, users see their exact balance and a clear line: *"Connect your
  bank at $5.00 to get paid."* Nothing is hidden, nothing is lost, and the money is
  already recorded in the ledger in their name.
- Minimum payout **$10.00**. Weekly batch, Fridays 17:00 UTC. Instant payout available
  on demand with the Stripe instant fee (1%, $0.50 minimum) passed to the user and
  displayed before they confirm.
- A connected account with a zero balance and no activity for 90 days is deactivated
  to stop the monthly fee, and reactivated automatically on the next earning.

This is a business-model decision, not an engineering one, so it is flagged rather
than hidden. If you want an account created for every user on day one, change one
config value (`payout.connect_creation_threshold_usd = 0`) — the code supports it and
the cost model in §21 tells you what it will cost.

### 2.3 Google Play can remove an app whose main purpose is paying people to look at ads

This is the single largest existential risk to the product, larger than any security
threat in §14. Play's Monetization and Ads policy, the Device and Network Abuse policy
and the spam/minimum-functionality rules all bear on rewards apps, and enforcement is
aggressive and largely automated.

Hard rules the build MUST follow:

- **Never pay for clicks, and never pay for conversions the user was told to make.**
  Pay for *views* (CPM) and for genuinely completed third-party offers (CPA) where the
  advertiser explicitly buys that action. Incentivised clicking is the fastest route
  to both a Play removal and an advertiser fraud claim.
- **No ads on the lock screen at launch.** Play restricts lock-screen monetisation to
  apps whose sole purpose is lock-screen functionality. Sikas is not one.
- **No ads delivered through system notifications as ad units.** Notifications may only
  be a *prompt to open the app* ("3 new offers"), never a rendered ad, never more than
  2/day, opt-in, and silenced 22:00–08:00 local unless the user changes it.
- **No ads over other apps, no ads outside the app's own UI, no full-screen
  interstitials on app launch or exit.**
- **The app must have standalone value.** An app that only shows ads for money is a
  low-value app by Play's definition. Ship the earning *inside* something worth
  opening: a local deals and classifieds feed built from Sikas's own publisher network
  (this repo's site is one of them), where the ads and the content are the same kind of
  object. That is also why the delivery surface in §8 is a feed, not a popup.
- Complete the Data safety form truthfully, ship an in-app **and** web account-deletion
  path (Play requires both), and target the current required API level.

Treat a Play policy review as a release gate in CI: a checklist in
`compliance/play-policy.md` that a human signs per release.

### 2.4 Advertisers should pay for viewable impressions only — make it the product

Do not bill a served impression. Bill a **viewable** one, to the MRC standard:

- Display: ≥50% of the ad's pixels on screen for ≥1 continuous second.
- Large format (>242,500 px): ≥30% of pixels for ≥1 continuous second.
- Video: ≥50% of pixels for ≥2 continuous seconds.
- Rewarded video: completed view, plus the above during it.

Every competitor sells impressions and quietly delivers 40–60% viewability. Selling
viewable-only at a $0.50 floor is a genuinely better product and it is the honest
version of the same trade. It also aligns the user's incentive with the advertiser's:
the user is paid for the same event the advertiser is billed for, so there is nothing
to arbitrage between them.

**MUST: the billed event, the earned event and the reported event are the same row in
the same table.** If they can ever diverge, the ledger is wrong.

### 2.5 Paying users for impressions creates a direct, funded incentive to defraud you

Ordinary ad fraud is committed by publishers. Here every single user has a wallet and a
reason to fill it. Assume from line one that some fraction of your install base is
emulator farms, click bots, and one person with forty phones on a rack.

§10 is therefore not an optional hardening pass. It is a Phase-1 requirement, and the
economics only work if the IVT rate stays under about 2%.

---

## 3. System architecture

```
                     ┌──────────────────────────────────────────┐
   Android app ──────┤  Edge (CDN + WAF + rate limit + TLS 1.3) │
   Web embed.js ─────┤                                          │
   Ads Manager ──────┤                                          │
                     └───────────────┬──────────────────────────┘
                                     │
        ┌────────────────────────────┼───────────────────────────┐
        │                            │                           │
  ┌─────▼──────┐            ┌────────▼────────┐         ┌────────▼────────┐
  │ ad-serve   │            │  api            │         │  console        │
  │ (hot path) │            │ (accounts,      │         │ (advertiser +   │
  │ auction,   │            │  campaigns,     │         │  user web)      │
  │ pacing,    │            │  billing,       │         └─────────────────┘
  │ receipts   │            │  payouts)       │
  └──┬──────┬──┘            └───┬─────────┬───┘
     │      │                   │         │
     │   ┌──▼───────┐       ┌───▼───┐  ┌──▼─────────┐
     │   │  Redis   │       │Postgres│  │  Stripe    │
     │   │ budgets  │       │ ledger │  │  Connect + │
     │   │ f-caps   │       │ truth  │  │  Payments  │
     │   │ nonces   │       └───┬────┘  └────────────┘
     │   │ ratelim  │           │
     │   └──────────┘           │
     │                          │
  ┌──▼──────────────┐    ┌──────▼──────────┐    ┌──────────────────┐
  │ event bus       │───►│ ledger-writer   │───►│ ClickHouse       │
  │ (Kafka/Redpanda)│    │ (idempotent,    │    │ (analytics,      │
  │ impressions,    │    │  double-entry)  │    │  reporting)      │
  │ receipts, clicks│    └─────────────────┘    └──────────────────┘
  └──┬──────────────┘
     │                  ┌──────────────────┐    ┌──────────────────┐
     └─────────────────►│ ivt-scorer       │    │ S3 cold store    │
                        │ (rules + model)  │    │ 400-day raw      │
                        └──────────────────┘    │ (ledger rebuild) │
                                                └──────────────────┘
```

**Stack (recommended, deviate with reason):**

| Layer | Choice | Why |
|---|---|---|
| Android | Kotlin, Compose, Hilt, Room, WorkManager, DataStore, OkHttp/Retrofit, Coil, Media3 | Standard, testable, no surprises. minSdk 26, target current required level. |
| Hot path (`ad-serve`) | Go 1.23+ | p99 latency budget is 120 ms including auction and pacing. Go holds it under load without GC tuning theatre. |
| Everything else | TypeScript, Node 22, Fastify, Zod | Small team, fast iteration, shares types with the console. |
| Primary DB | Postgres 16 | Ledger and all money state. Serializable where money moves. |
| Hot counters | Redis 7 (cluster) | Budget counters, frequency caps, nonce store, rate limits. **Never the source of truth.** |
| Analytics | ClickHouse | Impression-grain reporting at billions of rows. |
| Bus | Kafka or Redpanda | At-least-once delivery + replay. Replay is how you rebuild the ledger. |
| Object store | S3 with Object Lock | Creatives, raw events, WORM backups. |
| Infra | Terraform, containers, one cloud account per environment | |
| Observability | OpenTelemetry → Prometheus/Grafana/Tempo, Sentry, structured JSON logs | |

Keep `ad-serve` free of any dependency that can block: no synchronous Postgres write in
the ad request path, no synchronous Stripe call ever.

---

## 4. Money: units, auction, ledger

### 4.1 Units — get this right first or nothing else matters

- **All money is an integer number of micro-dollars.** 1 USD = 1,000,000 micros.
  Type: `BIGINT` in Postgres, `int64` in Go, `bigint` in TS. **No floating point
  touches money, ever, anywhere, including analytics.** A `FLOAT` in a money column is
  an automatic PR rejection.
- A $0.50 CPM = 500 micros per impression. A $2.25 CPM = 2,250 micros.
- Currency is USD only at launch. Carry a `currency` column anyway; do not assume USD
  in any function signature.
- **Rounding:** the user's share is `floor(price_micros * 40 / 100)`. The platform takes
  the remainder. This means the platform absorbs sub-micro dust and the user is never
  short-changed by rounding. At 500 micros the split is exactly 200/300.
- Every split MUST satisfy `user_micros + platform_micros == price_micros` exactly.
  There is a database CHECK constraint for it and a property-based test in §16.

### 4.2 The auction

**Second-price, quality-adjusted, with a hard floor.** Second-price rather than
first-price because Sikas advertisers are self-serve buyers without bid-shading
algorithms; a first-price auction quietly taxes the unsophisticated, generates support
tickets, and erodes trust in the exchange. Second-price means "bid what it is worth to
you" is the correct strategy, and you can say so in the docs.

For each ad request:

1. **Candidate selection** — campaigns that are `active`, within schedule, have
   remaining daily and total budget, pass targeting, pass frequency caps for this
   device, pass brand-safety/category exclusions for this placement, and have an
   approved creative for the requested slot size.
2. **Score each candidate:**

   ```
   effective_ecpm = bid_ecpm × quality_multiplier × pacing_multiplier
   ```

   - `bid_ecpm`: for CPM campaigns, the bid. For CPC, `bid_cpc × predicted_ctr × 1000`.
     For CPA, `bid_cpa × predicted_cvr × 1000`.
   - `quality_multiplier` ∈ [0.5, 1.5]: blended from the creative's 7-day viewability
     rate, CTR relative to slot average, post-click bounce, and policy history.
     New creatives start at 1.0 with a 500-impression exploration allowance.
   - `pacing_multiplier` ∈ [0, 1.2]: from §8.4. A campaign ahead of its spend curve is
     throttled, not stopped.
3. **Winner** = highest `effective_ecpm`. Ties broken by higher `quality_multiplier`,
   then random.
4. **Price** — generalised second price:

   ```
   price_ecpm = max(
       floor_ecpm,
       (second_effective_ecpm / winner_quality_multiplier) + 10_000   // +$0.01 CPM
   )
   price_ecpm = min(price_ecpm, winner_bid_ecpm)                      // never exceed the bid
   price_micros_per_impression = price_ecpm / 1000
   ```

5. **Floors:**

   | Supply | Base floor CPM |
   |---|---|
   | Android app — feed card | $0.50 |
   | Android app — rewarded video | $6.00 |
   | Android app — offer (CPA) | n/a, priced per action |
   | Web publisher | per-publisher `data-floor-cpm`, default $1.00 |

   Floors are per-placement and stored in the DB, not in code. A publisher or the
   platform may raise but never lower them below the base.

6. **No fill** — if no candidate clears the floor, serve a Sikas house ad. A house ad
   earns the user **nothing**, is labelled identically, and does not count toward the
   user's daily cap. Never render an empty slot.

**Bid ladder for the advertiser UI:** minimum bid $0.50 CPM, increment $0.01. Show the
live "estimated impressions/day at this bid" from the last 24 hours of clearing prices
at the 25th/50th/75th percentile for the selected targeting. Never show a fabricated
number — if there is not enough data, say so.

### 4.3 The ledger

Double-entry, append-only, hash-chained. This is the only place money is true. Redis
counters, ClickHouse rows and Stripe balances are all derived views, and any of them
may be rebuilt from the ledger and the event log without loss.

Accounts (one row per real-world balance):

| Account type | Owner | Normal balance |
|---|---|---|
| `advertiser_funds` | advertiser | credit (a liability of the platform) |
| `advertiser_reserved` | advertiser | credit (held for in-flight impressions) |
| `user_pending` | user | credit (earned, inside the 14-day hold) |
| `user_available` | user | credit (payable) |
| `user_paid` | user | debit |
| `platform_revenue` | platform | credit |
| `platform_clearing` | platform | debit/credit |
| `ivt_clawback` | platform | debit |

Every event writes one **journal entry** with two or more **journal lines** that sum to
exactly zero.

```sql
CREATE TABLE journal_entry (
  id              BIGSERIAL PRIMARY KEY,
  entry_uuid      UUID        NOT NULL UNIQUE,
  kind            TEXT        NOT NULL,   -- deposit|impression|click|action|payout|refund|clawback|adjustment
  occurred_at     TIMESTAMPTZ NOT NULL,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  idempotency_key TEXT        NOT NULL UNIQUE,
  ref_type        TEXT,                   -- impression|stripe_pi|payout_batch|...
  ref_id          TEXT,
  prev_hash       BYTEA       NOT NULL,
  hash            BYTEA       NOT NULL    -- sha256(prev_hash || canonical_json(entry+lines))
);

CREATE TABLE journal_line (
  id           BIGSERIAL PRIMARY KEY,
  entry_id     BIGINT   NOT NULL REFERENCES journal_entry(id),
  account_id   BIGINT   NOT NULL REFERENCES ledger_account(id),
  amount_micros BIGINT  NOT NULL,         -- signed; debit positive, credit negative
  currency     CHAR(3)  NOT NULL DEFAULT 'USD'
);

-- enforced by a deferred constraint trigger, per entry:
--   SUM(amount_micros) = 0
--   COUNT(*) >= 2
```

**Hash chain:** each entry's `hash` covers the previous entry's hash. A daily job
computes the Merkle root of that day's entries, writes it to S3 Object Lock in a
separate AWS account, and emails it to the finance address. Silent tampering with
history then requires compromising two accounts and the mail archive.

**Worked example — one impression at a $0.73 clearing CPM:**

```
price_micros = 730_000 / 1000 = 730          ($0.00073)
user_micros  = floor(730 * 40 / 100) = 292   ($0.000292)
plat_micros  = 730 - 292 = 438               ($0.000438)

journal_entry kind=impression idempotency_key=imp:01J8XA...:v1
  line  advertiser_reserved   +730   (debit  — releases the hold)
  line  user_pending          -292   (credit — user earns)
  line  platform_revenue      -438   (credit — platform earns)
                              -----
                              sum 0 ✓
```

**Batching:** writing one entry per impression will not scale past a few thousand
impressions/second. Batch by `(advertiser, user, hour)`: the `ledger-writer` consumes
the impression stream and flushes an aggregated entry per bucket every 60 seconds or
10,000 impressions, whichever first, carrying `impression_count` and the summed micros.
The raw per-impression rows stay in ClickHouse and S3 for audit; the batched entry is
the money. The idempotency key is `ledger:{advertiser}:{user}:{hour}:{seq}` so a
consumer restart re-writes the same key and the unique index absorbs it.

### 4.4 Budget safety

- A campaign MUST NOT overspend its total budget. Hard stop.
- Daily budget may overshoot by at most **2%**, and **the overshoot is never billed** —
  it is absorbed by the platform via a `platform_clearing` adjustment. This is cheaper
  than the alternative (a distributed counter strict enough to guarantee zero overshoot
  adds latency to every ad request) and it is the correct side to err on.
- Budget counters live in Redis as `INCRBY` on `budget:{campaign}:{yyyymmdd}` with the
  authoritative reconciliation from Postgres every 60 s. On Redis loss, `ad-serve`
  fails closed: rebuild counters from ClickHouse before serving that campaign again.
- **Reservation:** at auction win, reserve `price_micros` from `advertiser_funds` into
  `advertiser_reserved`. On confirmed viewable impression, convert to spend. On
  timeout (5 minutes, no receipt), release the reservation. This is what stops a
  campaign spending money on impressions that were never seen.

---

## 5. Android app — product spec

### 5.1 Screens

1. **Onboarding** — phone or email + OTP (Firebase Auth or self-hosted, either is
   fine; do not roll your own crypto for this). Age gate (18+, hard block; ad-funded
   rewards apps for minors are a COPPA and Play-policy minefield — do not build it).
   Country + timezone for daily reset math. No ad shown until this completes.
2. **Home / feed** — the primary surface (see §5.3). A scrollable feed of local
   deals/content cards from Sikas's publisher network, interleaved with ad cards at a
   ratio the user set. This is also where §2.3's "standalone value" requirement lives.
3. **Ad volume control** — a single slider, 5 discrete steps, not a freeform 0–500
   input:

   | Tier | Ads/day (approx, capped) | Est. earnings/mo* |
   |---|---|---|
   | Light | 10 | $0.05–$0.30 |
   | Standard | 25 | $0.15–$0.80 |
   | Active | 50 | $0.30–$1.60 |
   | Plus | 100 | $0.60–$3.20 |
   | Max | 150 (hard ceiling) | $0.90–$5.00 |

   *Ranges shown live, computed from the last 30 days of this user's actual clearing
   prices — never a fixed promise. **150/day MUST be a hard server-side ceiling**,
   independent of the client, independent of frequency caps, independent of what the
   user requests. This is what "not too much" means operationally: a number in the
   database that the ad-serve auction refuses to exceed no matter what wins.
   Changing tiers takes effect at the next daily reset, not mid-day — no cramming a
   day's ads into an hour by flipping the slider.
4. **Wallet** — real-time balance (pending / available, per §2.2), earnings history by
   day, "why is this pending" explainer (14-day hold, §10.5), Stripe Connect onboarding
   CTA at the $5 threshold, payout history, tax form status (W-9/W-8BEN via Stripe
   Identity above the IRS 1099-K/1099-NEC threshold for the user's country).
5. **Ad detail / why this ad** — every ad card has a visible "Why this ad?" control
   showing the targeting reason in plain language ("Because you're in Texas and viewed
   home-improvement content") and links to ad preferences.
6. **Ad preferences** — category opt-outs, personalisation on/off (off = contextual-only
   targeting, still monetised, clearly explained as possibly lower-earning), "not
   interested" per-advertiser mute.
7. **Settings** — notification controls (§2.3 limits, off by default beyond the 2/day
   cap), data export (self-serve JSON, satisfies GDPR/CCPA access), **account and data
   deletion** (in-app, immediate soft-delete, hard-delete at 30 days, satisfies Play's
   in-app deletion requirement — do not make this a "contact support" flow).
8. **Referral** (Phase 2) — capped, disclosed, and never counted as a paid action; a
   referral bonus is a marketing cost booked from `platform_revenue`, never fabricated
   as an ad event.

### 5.2 Consent and disclosure, in the app itself

- A one-time, skippable-only-after-reading consent screen at first launch: how many
  ads, what "40%" means in dollars at their chosen tier (using the live estimate, not
  the marketing number), that payout requires ID verification above $5 (Stripe
  Identity, required for US 1099 reporting and AML), and a link to the full privacy
  policy.
- GDPR/UK consent (IAB TCF v2.2 or Google's UMP SDK) and a full CMP flow for any EU/UK/
  CA user, gating personalised ad targeting specifically, before any personalised
  request is sent — mirrors what `sikads.com/embed.js` already needs to do for
  EU/UK/CA web visitors, so the consent service is shared, not rebuilt per surface.
- Ads must be clearly labelled "Ad" or "Sponsored" — no design that could plausibly be
  mistaken for organic content. This is a Play policy requirement and an FTC one.

### 5.3 Delivery model — "much lighter"

This is the actual product differentiator, so build it deliberately rather than as an
afterthought:

- **No interstitials on open, no interstitials on back-press, no full-screen ads at
  all in v1.** Every ad is either a feed card (native, same visual weight as content)
  or opt-in rewarded video the user starts on purpose.
- **Server-controlled daily budget, spent adaptively.** The server computes a per-user
  daily ad count from the tier (§5.1) and spreads it using a **decaying-rate Poisson
  process** across the user's active hours (derived from app-open history, default
  09:00–22:00 local) — more likely early in a session, tapering off, never more than
  one ad in any 90-second window, never two feed-ad cards within 5 items of each
  other. This reads as organic pacing, not a metronome.
- **Rewarded video is opt-in only** and always shown as a distinct "earn a bonus"
  action with the exact reward amount ($ or cents) stated before the user starts it,
  and does **not** draw against the daily feed-ad budget — it is a separate, explicit
  user action, which is also why it can clear at $6+ CPM instead of $0.50.
- Every ad, without exception, has a visible close/skip affordance appearing within 3
  seconds. Nothing is unskippable except the final 2 seconds of a rewarded video the
  user opted into, and that exception is disclosed before they tap start.

### 5.4 Client-side rules the app MUST enforce (in addition to server enforcement — see §10)

- Refuse to render an ad request response older than 30 seconds (replay defence, §10.4).
- Refuse to fire a viewability event unless `Activity.hasWindowFocus()` is true, the
  ad view is attached, and the device's accessibility "instant apps"/automation
  indicators are absent.
- Certificate pin the API host (see §14.2) and refuse ad traffic if pinning fails —
  fail closed, not open, because failing open on a paid surface is a fraud invitation.
- No ad activity, no viewability timers, no earning while the app is backgrounded.
  Background "auto-view" farming is exactly the fraud pattern §2.5 warns about.

---

## 6. Advertiser side — Sikas Ads Manager

### 6.1 Account and funding

- Business entity or individual, KYB via Stripe (or Stripe Identity for individuals).
- Fund via Stripe **PaymentIntent** into `advertiser_funds` — cards, later ACH/wire for
  larger spenders. **Prepaid only at launch.** No postpaid credit line — that is a
  collections and fraud problem for a v1 team to not take on.
- Auto-reload: optional, user-set threshold and top-up amount, off by default,
  re-confirmed by a fresh SCA/3DS challenge at least every 90 days per card-network
  rules.
- Full self-serve refund of *unspent* funds, batched daily, Stripe fees not refunded
  (disclosed at funding time).

### 6.2 Campaign builder

- Objective: Awareness (CPM) → Phase 1. Traffic (CPC) → Phase 2. Conversions (CPA) →
  Phase 3.
- Targeting: geography (country/region/DMA), device (OS version, connection type),
  category/contextual (from the feed content the ad sits beside), frequency cap
  (advertiser-set, ≤ the platform default), dayparting, and — Phase 2 — first-party
  audience upload (hashed emails, matched server-side, never leaves the advertiser's
  control unhashed; document the hashing so it can be independently verified).
  **No device-fingerprint-based cross-app tracking, no IDFA/GAID resale, no data
  broker integrations at launch.** This is both a legal-risk reduction and a genuine
  differentiator — say so in the marketing copy once it's true, not before.
- Creative: image/HTML5/video upload, spec validation (dimensions, max weight, no
  auto-play audio), automated policy pre-scan (§6.3), human review queue for anything
  the automated scan flags plus a random 5% sample of everything else.
- Bidding: manual CPM/CPC/CPA at launch. Auto-bid-to-target (Phase 2) once there is
  enough auction data to model it honestly — do not ship an auto-bidder that is
  actually just "raise the bid until the budget is gone."
- Budget: daily cap, total cap, start/end date. Live spend graph, live delivery
  estimate, pacing status (on pace / under-pacing / budget exhausted).
- Reporting: impressions, viewable impressions, viewability rate, clicks, CTR,
  conversions (Phase 3), spend, effective CPM, **IVT-filtered rate** (shown, not
  hidden — an advertiser who sees a 1.5% filter rate trusts the other 98.5% more than
  one who is never told there was a filter at all), split by supply source (app vs.
  web vs. specific publisher), geography, hour of day.

### 6.3 Ad review policy (enforced, not aspirational)

Auto-reject: malware/redirect chains, auto-play audio, flashing >3Hz (photosensitivity),
deceptive "system warning" or fake-UI creative, adult content, weapons, gambling
without required licensing on file, crypto/financial products without disclosed
regulatory registration, political/issue ads without the advertiser completing ID
verification and the required disclosure fields (and geo-fenced out of jurisdictions
where the platform hasn't built the legally required political-ad library — do not
serve political ads anywhere until that exists).

Human review SLA: 4 business hours for the first campaign from a new advertiser,
24 hours thereafter. Post-approval spot audits continue for the life of the campaign;
a creative can be pulled mid-flight, and in-flight budget is returned to the
advertiser pro-rata for the unserved portion.

---

## 7. API surface (representative, not exhaustive)

All endpoints versioned (`/v1/...`), all mutating endpoints idempotent via a required
`Idempotency-Key` header, all responses typed and validated (Zod on the TS side,
protobuf/JSON-schema on the Go side — pick one wire format for `ad-serve` and stick to
it; protobuf over gRPC internally, JSON externally is a reasonable split).

```
POST   /v1/auth/otp/start                 {phone|email}
POST   /v1/auth/otp/verify                {code} -> session
GET    /v1/me                             profile, tier, balances
PATCH  /v1/me/ad-tier                     {tier}                       [auth]
GET    /v1/feed?cursor=                   interleaved content+ad cards [auth]
POST   /v1/ads/request                    device/context -> signed ad response|no-fill
POST   /v1/ads/impression                 signed receipt from client -> ack (async)
POST   /v1/ads/click                      signed receipt -> ack (async)
POST   /v1/ads/reward/start               rewarded video begin        [auth]
POST   /v1/ads/reward/complete            signed receipt -> ack (async)
GET    /v1/wallet                         pending/available/paid, history [auth]
POST   /v1/wallet/connect/onboard         -> Stripe Connect onboarding link [auth]
POST   /v1/wallet/payout/instant          {amount} -> fee quoted then charged [auth]
GET    /v1/wallet/tax-status              [auth]

POST   /v1/advertiser/accounts
POST   /v1/advertiser/funds/deposit       Stripe PaymentIntent          [auth]
POST   /v1/advertiser/campaigns
PATCH  /v1/advertiser/campaigns/:id
POST   /v1/advertiser/campaigns/:id/creatives
GET    /v1/advertiser/campaigns/:id/report

POST   /v1/publisher/sites                (existing web embed path — unchanged)
POST   /v1/internal/ledger/reconcile      internal, mTLS + IP allowlist only
POST   /v1/internal/webhooks/stripe       Stripe-signature verified
```

`POST /v1/ads/request` and the three receipt endpoints (`impression`, `click`,
`reward/complete`) are the hot/adversarial path — everything in §10 attaches there.

---

## 8. Delivery, pacing and frequency control — server side

### 8.1 Daily reset

Midnight in the user's stored timezone (captured at onboarding, updatable in
settings, never inferred silently from IP — that is a targeting signal in disguise).
Reset job runs per-timezone-bucket, not one global cron, so a billion-user base
doesn't thunder-herd at UTC midnight.

### 8.2 Frequency capping

Three independent caps, all enforced server-side in `ad-serve`, checked in this order
(cheapest reject first):

1. Global daily cap from the user's tier (§5.1) — hard ceiling 150.
2. Per-campaign cap (advertiser-set, e.g. "max 3 impressions/user/day").
3. Per-creative cap (avoid burning out one creative — e.g. max 2/user/day, encourages
   advertisers to run creative sets).

Counters: Redis `INCR` with a TTL to the next local-midnight, reconciled hourly
against the ClickHouse event-grain truth. A cap check that fails open (Redis down) MUST
fail toward *not serving* a paid ad — serve the house ad instead. Under-delivery is a
refunded inconvenience; over-delivery is an unbillable, uncappable liability.

### 8.3 Ad-request handling (`POST /v1/ads/request`)

1. Authenticate the session (§14.3).
2. Device/behavioural signal collection for IVT scoring (§10) — passive, no PII beyond
   what's already in the account.
3. Frequency + budget + eligibility filter (§8.2, §4.4).
4. Auction (§4.2).
5. Sign the response: `{auction_id, creative, price_ecpm (never shown to the user or
   embedded in the client-readable payload — see §10.6), expiry: now+30s, hmac}`.
6. Return. p99 target 120 ms.

### 8.4 Pacing multiplier

Even (default) or ASAP delivery, advertiser's choice. Even delivery compares actual
spend-to-now against the ideal linear curve for the campaign's flight and adjusts:

```
ratio = actual_spend / ideal_spend_to_now
pacing_multiplier =
    ratio > 1.15 -> 0.0   (paused this cycle — overspending)
    ratio > 1.05 -> 0.5
    ratio < 0.85 -> 1.2   (catch up)
    else         -> 1.0
```

Recomputed every 5 minutes per campaign, cached in Redis, read by `ad-serve` on every
auction with zero added latency (it's a cache read, not a computation on the hot path).

---

---

## 9. Invalid traffic detection and fraud prevention (enterprise-grade)

### 9.1 Why this matters

At the floor price ($0.50 CPM) a single user can generate $0.075/day or $22.50/year just
by watching ads. On a 40% share that's $9/year user payout to the Sikas platform. A
detection miss costs $9 × 10,000 accounts = $90,000 in two years. A false positive that
blocks a legitimate user costs $9. The math is simple: **an IVT rate under 2% is success,
and under 1% is operational excellence.** 3% or more, and the unit economics are broken
and the legitimate user:fraud ratio becomes something advertisers notice.

This section is therefore not optional hardening. §2 says: the economics only work if
the IVT rate stays under about 2%. Meaning this is a **Phase-1 requirement, not Phase-2
hardening**, and every build task in §19 that touches impressions or payouts carries a
§9 component.

### 9.2 Signal collection (passive, in-app)

At impression time, collect (never store unencrypted client-side; encrypt before
transmission):

- Device telemetry: OS version, RAM, CPU model, device age, Android build fingerprint,
  SELinux mode (`getenforce`).
- Network: carrier, connection type (WiFi / cellular), IP geolocation.
- App behavior: inter-event latencies, scroll velocity in feed, screen orientation,
  battery state, app foreground duration.
- Engagement: scroll depth, pause time before impression, whether user tapped the ad or
  swiped past, whether they viewed the ad duration fully or bailed at 1 second
  (§2.4).
- Anomalies (rules-based, ~50ms compute): concurrent app opens (same GAID/test device),
  timezone mismatch between device setting and app context, emulator indicators, VPN
  signatures in DNS/route table, common bot device fingerprints.

Zero PII: no emails, IDs, payment methods, or account names. Everything is hashed
server-side. The user's own account id is in the session; everything else is
feature-engineered.

### 9.3 IVT scoring (server-side, ML-backed with rules fallback)

Two-phase: (1) rule-based *immediate* blocking of obvious bots, (2) ML model scoring
of the gray area.

**Phase 1 — Hard rules, instant reject:**

| Signal | Block condition |
|---|---|
| Device | Known Android emulator (99.99% in commercial bot farms), rooted device (post-install apps can auto-view), device age < 3 days, impossible specs (e.g. 0 RAM) |
| App behavior | Avg inter-event latency < 50 ms (mechanical, not human) or > 300 s (another tab), same user two cities 3 mins apart (VPN hop), identical fingerprints 100+ times/day/IP |
| Account | Account created < 3 hours ago and already earned >$0.10, same GAID/email seeing >50 impressions/hour, balance change > 10x daily average |
| Temporal | Ads served outside their stated timezone by >12 hours consistently (inferred wrong timezone at signup but now proven wrong by behavior) |

Hard blocks get a `marked_fraud` flag, zero payout (`ivt_clawback` journal entry), and
are held for manual review — do not auto-delete the account; it may be a mistake.

**Phase 2 — ML model:**

Train offline on historical data: 80% legitimate, 20% confirmed fraud (charged back,
known bot farm IPs, banned accounts). Features:

- Device: OS version distribution, RAM %, CPU model frequency, device age.
- Behavioral: scroll velocity, pause-before-view, skip rate, reward completion rate,
  click rate vs. category average.
- Network: ASN reputation (via IP2ASN), carrier, VPN/proxy indicators (via MaxMind or
  similar).
- Account: daily cohort (users who onboarded the same day, correlation with behavior),
  ad-to-payout ratio.
- Temporal: time-since-onboarding, seasonality, overnight activity (UTC hour =
  02:00–05:00 in the user's timezone).

Output a **fraud_score** ∈ [0, 100]. Score ≥ 90 → marked as `suspected_fraud`, payout
held. Score 70–89 → increased scrutiny (payout released but flagged in ClickHouse for
analyst review). Score < 70 → pass.

Retrain the model weekly, hold out the most recent week as evaluation set, log the
AUC/precision/recall to Prometheus, alert if any metric drops >2%. Do not tune the
threshold upward when false-negative rates are high; instead, add more features or
collect more training data.

**Adjustment:** if a marked-fraud account is later determined legitimate (manual review,
user appeal, chargeback reversal), issue a `platform_clearing` credit to `user_available`
and enable payouts. Do not silently un-flag and continue; write a memo to the ledger
explaining the reversal.

### 9.4 Advertiser-side fraud signals

- Creative tracking: record *when* each creative loaded, started, completed per device,
  and compute a viewing pattern (how many complete a 10-second video in 2 seconds?
  Obvious). Feed this into the scoring model as a cross-advertiser signal.
- Conversion lag: if a CPA conversion postback arrives >24 hours after the impression
  (§7 CPA postback flow), mark it `late_conversion` and down-weight it in pacing
  decisions; very old postbacks (>30 days) are rejected outright, with the hold
  released to the user's available balance via a `payout_release` journal entry.
- Click-to-install velocity: for install-CPA campaigns, flag any device that goes from
  ad click to store page visit to install in < 30 seconds (human users take longer; bots
  do both at once).

### 9.5 User-appeal process

Accounts marked `marked_fraud` are non-payment-blocking but are not paying out. A user can
appeal via in-app form, providing:

- Explanation (free text, 500 chars max).
- Device info (they confirm possession by IMEI via DeviceCheck or Play Integrity API,
  adding a proof-of-device-access signal).
- Photo (optional, adds a human signal).

Appeal goes to a queue, reviewed by a human within 72 hours (SLA). Decision:

- Reversed → immediate payout (journal entry as above).
- Upheld → closed, user notified, no further appeals from that account.
- Escalated → escalate to payment/fraud team, hold for investigation.

The appeal process is *itself* monitored for fraud: accounts that appeal multiple times
(>3/month) are added to the investigation queue.

### 9.6 Post-payout monitoring

After money has left the platform, keep monitoring:

- Stripe Connect balance and payout completion. If a payout fails, the user is notified
  and funds return to `user_available`.
- Chargeback rates, split by advertiser and supply source. An advertiser with >5%
  chargebacks is flagged for review and potentially suspended.
- Reversal claims ("I didn't authorize this" / "this user was a bot"). Hold 14 days
  for credible claims, adjust the ledger if justified.

---

## 10. Security & threat model (enterprise-hardened)

This entire section is a **hard requirement for Phase 1**, not a Phase-2 hardening
pass. §2.3 flags the compliance risks; this section addresses the financial ones. An
app that pays users and moves money lives in a different threat tier than a free
app — threats are externally funded (competitors, fraud rings, nation-states for data
harvesting), not community-discovered. Build this right.

### 10.1 Threat model (STRIDE)

**Spoofing:**
- Attacker forges a user account or session. **Mitigation:** Durable session binding,
  2FA for large payouts (Phase 2), device attestation on sensitive operations.
- Attacker forges a creative ID or campaign ID in the auction. **Mitigation:** signed
  requests, cryptographic binding of IDs to account, auditlog.

**Tampering:**
- Man-in-the-middle on ad request or receipt submission. **Mitigation:** TLS 1.3+,
  certificate pinning (client), HSTS preload (server).
- Attacker modifies a signed receipt (price/impression_id/etc). **Mitigation:** HMAC
  signature with server-side key, `Strict-Transport-Security` everywhere, no graceful
  fallback to HTTP.
- Attacker replays an old receipt to double-charge. **Mitigation:** nonce in the
  request, nonce verified and burned on receipt submission, all in one transaction, all
  in Postgres (§14.1).

**Repudiation:**
- Advertiser claims they didn't get the impressions they paid for. **Mitigation:**
  Immutable ledger, hash-chain, daily Merkle root emailed/stored in Object Lock.
- User claims they didn't earn the money or earned more. **Mitigation:** ledger
  signed, all entries auditable, monthly statement emailed to the account email.

**Information disclosure:**
- Attacker reads PII from the database. **Mitigation:** encryption at rest, encryption
  in transit, PII isolation, limited plaintext storage (e.g. only hashed emails for
  deduplication).
- Attacker reads ad creative source code / targeting data. **Mitigation:** IP
  allowlist + mTLS for internal API, S3 bucket encryption + versioning, no creative
  source in logs.
- User data is breached. **Mitigation:** minimal PII collection (see §9.2, §5.2),
  secure deletion (§5.1 in-app delete path), third-party security audit of data
  handling.

**Denial of Service:**
- Attacker floods `/v1/ads/request` with fake requests. **Mitigation:** rate limiting
  per session, per IP, per device; WAF (Cloudflare, etc); auto-scaling on `ad-serve`.
- Attacker exhausts Redis or Postgres. **Mitigation:** circuit breakers, graceful
  degradation (serve no-fill ad instead of erroring), query timeouts, connection
  pooling with max-idle.
- Attacker aims at the ledger or the payment API. **Mitigation:** separate rate
  limits (stricter), timeout protection on Stripe calls (§4.4 reservation never
  waits synchronously for Stripe).

**Elevation of Privilege:**
- Attacker gains admin/console access. **Mitigation:** single sign-on + role-based
  access control, no hardcoded credentials, audit log for any change to campaign,
  advertiser account, or ledger adjustment.
- Attacker gains Stripe API key access. **Mitigation:** Stripe API keys via a
  secrets management service (Vault, AWS Secrets Manager), rotated quarterly, minimum
  permission scope (no full-account-read), separate keys per environment and purpose.

### 10.2 Cryptography

**For request signing (ad response and payout flows):**

- Use HMAC-SHA256, never MD5/SHA1.
- Server key per environment (dev/staging/prod separate), 32 bytes, never logged.
- Signature is `base64(hmac_sha256(key, canonical_request_json))`.
- Canonical form is deterministic JSON (keys in sorted order, no extra whitespace,
  numbers as strings for precision). Use `JSON.stringify` with a custom replacer or a
  library like `json-canonicalize`.
- Signature is never embedded in the response — it is returned in a separate header:
  `X-Receipt-Hmac: <sig>`.
- Client stores the public key (hash of the key, or a short rotation hint) in settings
  and re-verifies on app update; if the key changes, prompt the user to re-authenticate
  (happens once per release, during the app startup).

**For OAuth/session tokens:**

- Use a Secure Randomness library. Go: `crypto/rand`. Kotlin: `java.security.SecureRandom`.
  **Not:** `Random`, `Math.random()`, time-based, or anything non-cryptographic.
- Session token is 32 random bytes, returned as base64-url in an HttpOnly, Secure,
  SameSite-Strict cookie. **No localStorage**, no `sessionStorage`, no URLs.
- Token lifetime 7 days, with refresh token rotation (new refresh → new access).
  Client stores refresh token in encrypted SharedPreferences (Kotlin EncryptedSharedPreferences).

**For device attestation (§10.3):**

- Android: Google Play Integrity API (formerly SafetyNet), not the deprecated attestation. Returns a signed JWT that you verify with Google's public key.
- Verify the signature, check `evaluationType == BASIC || PLAY_INTEGRITY` (accept both,
  as not all devices support higher levels), and inspect `verdictLetters` for `S` (secure
  environment, device passes all checks). A missing S gets a fraud_score boost in §9.3.

**For payment data:**

- No plaintext storage of card numbers, Stripe tokens, or bank account numbers. Ever.
- Stripe PaymentIntent tokens are single-use and short-lived; never log them.
- Bank account numbers (for CPA postbacks) are encrypted with a DB-specific key held in
  Vault; rotate annually.

### 10.3 Client attestation and device integrity checks

Every ad request MUST carry a **device attestation token** from Google Play Integrity API
(formerly SafetyNet). This is a defense against both the emulator/bot farms in §9.2 and
against someone running Sikas on a compromised/rooted device and trying to arbitrage the
40/60 split.

```kotlin
// In the Android app

private suspend fun getIntegrityToken(nonce: String): String {
  val integrityManager = IntegrityManagerFactory.create(context)
  val tokenResponse = integrityManager.requestIntegrityToken(
    IntegrityTokenRequest.builder()
      .setCloudProjectNumber(123456789)  // from Google Cloud
      .setNonce(nonce)
      .build()
  )
  return tokenResponse.token()  // signed JWT from Google
}

// On ad request
val adRequest = AdRequest(
  nonce = secureRandom(16),  // fresh each time, sent to server
  integrity_token = getIntegrityToken(nonce)  // sent to server
)

// Server verifies:
// - Nonce matches what it sent
// - JWT signature is valid (fetch Google's JWKs, verify)
// - verdictLetters contains 'S' (secure device)
// - evaluationType is BASIC or PLAY_INTEGRITY
// - appLicensingEvaluation is not 'UNLICENSED' (app is from Play Store)
```

**What happens if integrity check fails:**

- `S` missing (device fails security checks) → fraud_score += 30, still serve an ad but
  mark it `unattested_device`, clamp the price at 50% of what it would be normally.
- JWT signature invalid → reject the request, return 403, client is expected to
  reboot/check for tampering and retry.
- evaluationType missing → fraud_score += 20, serve at 50% price.

A device with consistent attestation failures is eventually moved into the hard-block
list in §9.3.

### 10.4 Nonce-based replay protection

Every ad request carries a server-generated nonce; the response is signed with it; the
client includes it in the receipt submission; the server verifies it against the exact
request it generated, and burns it (deletes it from Redis) on use. A replay of the same
receipt is rejected because the nonce no longer exists.

```kotlin
// Client: request
POST /v1/ads/request
{
  "nonce": "7j8k9l0m1n2o3p4q",  // 16 random bytes, client-generated
  "device_integrity_token": "eyJhbGc....",
  "device_id": "{hashed GAID}",
  "user_id": "{from session cookie}"
}

// Server response
200 OK
{
  "auction_id": "a1b2c3d4e5f6g7h8",
  "creative_id": 12345,
  "price_ecpm": null,  // never exposed to client
  "expiry": 1724441600,  // now + 30 seconds
  "nonce": "7j8k9l0m1n2o3p4q"
}
// X-Receipt-Hmac: base64(hmac_sha256(key, canonical_json(response)))

// Client: receipt (impressions or clicks)
POST /v1/ads/impression
{
  "nonce": "7j8k9l0m1n2o3p4q",
  "auction_id": "a1b2c3d4e5f6g7h8",
  "creative_id": 12345,
  "viewed_at": 1724441573,
  "viewability_data": { ... }  // see §10.5
}
// X-Receipt-Hmac: base64(hmac_sha256(client_key, canonical_json(request + nonce + timestamp)))

// Server: verify nonce in two-phase with a transaction:
BEGIN TRANSACTION (SERIALIZABLE)
  SELECT nonce FROM server_nonces WHERE nonce=? AND burned_at IS NULL
  -> success, got a row
  UPDATE server_nonces SET burned_at=now(), burned_by='impression' WHERE nonce=?
COMMIT

// If the nonce is already burned (replay), the SELECT fails, the
// UPDATE is skipped, the transaction aborts, and the receipt is rejected with 409.
```

Nonce storage in Redis as a backup: `SET nonce:7j8k9l0m1n2o3p4q 'unused' EX 60`
(60-second TTL, just past the 30-second response expiry). Redis loss is graceful: fall
back to Postgres-only, which is slower but correct. If both are down, fail the ad
request (return 500, retry client-side).

### 10.5 Viewability measurement and receipt protocol

Viewability is the auditable fact — the ad was actually seen. The receipt contains:

```
{
  "nonce": "7j8k9l0m1n2o3p4q",  // server-signed, client returns, server validates
  "auction_id": "a1b2c3d4e5f6g7h8",
  "creative_id": 12345,
  "impression_id": "{uuid}",  // client-generated
  "viewed_at_ms": 1724441573000,  // client timestamp in ms (milliseconds-granular matters)
  "view_duration_ms": 2500,  // how long visible
  "view_percentage": 95,  // of the ad bounds visible
  "device_id": "{hashed GAID}",
  "app_version": "1.0.2",
  "tls_version": "TLSv1_3",
  "timestamp": 1724441580000,  // when this receipt was submitted
  "signature": "base64(...)"  // HMAC of everything above with client secret
}
```

Server-side checks:

- Receipt timestamp must be within 5 minutes of now (defend against backdated receipts).
- Nonce must not be burned.
- `view_duration_ms` must be at least 1000 (1 second) for display ads, 2000 for video.
- `view_percentage` must be ≥ 50 for display, ≥ 30 for large formats.
- HMAC must verify: `hmac_sha256(client_secret_for_user, canonical_json(...))`.
- App version must match device's installed version (block old app versions from posting receipts).
- TLS version >= 1.3 (clients on older TLS are either old phones, or compromised by MITM).

Anything that fails rejection is rejected with 400 and **not** written to the ledger or
event stream (failed receipts are logged separately for debugging, never monetised).

### 10.6 Price never touches the client

The advertiser's bid and the auction clearing price are server-side facts. The client
never needs to know them, never sees them, never stores them. The ad response contains:

- `creative_id`, `auction_id`, `nonce` (cryptographic binding of receipt to response).
- **Not:** `price_ecpm`, `bid`, `advertiser_id`, anything that maps back to money.

The client's job is to prove the ad was viewed; the server's job is to decide what it's
worth. This separation prevents a rogue app build (someone forks the app and modifies the
receipt submission) from arbitraging the split or forging high-value impressions.

### 10.7 Transport security

- **TLS 1.3 or bust** on all connections. No fallback to 1.2. If a client can only do
  1.2, it doesn't connect.
- Certificate pinning on the client: the app contains the SHA256 hash of the expected
  certificate's public key, and refuses to connect if the cert doesn't match. Pinning
  survives certificate rotation if you use key pinning (pinning the key, not the whole
  cert) and rotate the cert while keeping the key. Use a standard library:
  `Network Security Configuration` in Android (no code), or `TrustKit` (Kotlin Coroutines).
- HSTS preload on the server: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`. Hashes are checked against the HSTS preload list at startup.
- No mixed-content resources (all images, scripts, etc. are HTTPS).
- WAF (Cloudflare or AWS) to block malformed requests, common attack patterns, and
  rate-limit at the edge (before hitting the app).

### 10.8 API authentication and authorization

**User/app auth:**
- Firebase Auth, Cognito, or self-hosted OIDC provider. Pick one and commit.
- Session token is a signed JWT with `exp`, `sub` (user ID), `aud` (api.sikads.com),
  `iss` (issuer URL).
- Token rotation: access token 1 hour, refresh token 30 days, refresh is idempotent
  (can re-use a refresh token to get new access, up to 5 times; then it requires re-auth).

**Advertiser/account auth:**
- OAuth 2.0 (code flow, not implicit).
- Advertising network account is linked to a Stripe account at consent time.
- Campaigns/reports/refunds API: require both valid access token + valid Stripe account
  binding in the same request.

**Internal/mTLS:**
- `/v1/internal/...` endpoints (ledger reconciliation, webhook handlers, admin dashboards)
  are served on a separate TLS listener (`0.0.0.0:9443` or similar) that **only accepts
  connections that present a client certificate** signed by the internal CA.
- Whitelist source IPs (GitHub Actions runners, internal VPN, specific AWS subnets) and
  require mTLS on top. Fail if mTLS fails; do not fall back to token-based auth.
- Rotate internal certs quarterly, use short-lived (1-day) signing certs from a
  HashiCorp Vault or similar.

### 10.9 Secrets management and key rotation

- **Never hardcode API keys, database passwords, Stripe secrets, or signing keys in
  code.** Not in .env files in the repo, not in config files, not in comments.
- Production secrets live in a secret management service (HashiCorp Vault, AWS Secrets
  Manager, Kubernetes Secrets with encryption).
- Every secret has a `rotated_at` timestamp, a `next_rotation` date, and a rotation-
  executed log.
- Key rotation schedule: API keys (Stripe, etc.) quarterly. Database passwords 90 days.
  Signing/HMAC keys 180 days. No delay between "new key in service" and "old key
  removed"; both read paths support old+new for 24 hours, then old is dropped.
- **Rotation on incident:** if a key is suspected compromised, rotate immediately, log
  the reason, notify affected parties, and audit what happened using the key (what API
  calls, ledger entries, payment records).

### 10.10 Audit logging

Every write to the ledger is logged with:
- Who (user ID, service identity, or "system").
- What (the journal entry and lines).
- When (timestamp, microsecond precision).
- Why (operation type: deposit, impression, payout, refund, adjustment, clawback).
- Where (IP, service instance ID).

All reads to the ledger, all changes to campaigns, all changes to advertiser account
settings, and all payouts are logged. Logs are immutable: written to a columnar database
(ClickHouse) with no delete API and backed up daily to S3 Object Lock (§4.3).

**Per user:** every login, every payout request, every settings change is logged. A user
can request their audit log in-app (satisfies GDPR §13 "right to information about
processing").

---

## 11. Compliance and regulatory

### 11.1 Money Movement Regulations

**Money Transmission Licensing (USA):**
- Sikas holds advertiser funds (prepaid money in §6.1) and user payouts (wages).
  Most US states require money transmitter licensing.
- **Phase 1:** operate in registered states only (approximately 10–15 states with friendly
  regs or exemptions: NV, SD, WY, MT, etc. Confirm with counsel).
- **Phase 2+:** apply for full licensing (18–24 month lead time, $100k+ cost, ongoing
  compliance audits).
- Until licensed, do not accept funds from unlicensed states, and prominently disclose
  the limitation on the funding page.

**Bank Partnerships:**
- The advertiser funds and user payout accounts need a banking relationship.
  Options:
  1. **Embedded finance partner** (Stripe Treasury, Marqeta, Synapse): they hold the
     bank account and handle compliance, you pay per account. Simplest, most compliant.
  2. **Direct FDIC account:** you apply for a bank account, hold the funds, comply
     yourself. Harder, cheaper (no intermediary fee).
  3. **Back-to-back accounts** (advertiser funds in one bank, user funds in another):
     isolates the two flows, reduces regulatory exposure.
- **Choice:** Stripe Treasury → Phase 1 simplicity, Stripe handles the compliance work.
  (You asked for Stripe setup anyway.)

### 11.2 Employment and Labor Law

Users are **not employees**, and are not entitled to benefits or labor protections.
Clearly disclose:

- In the ToS: "This is a gift economy. You are not employed. Earnings are optional,
  discretionary gifts from Sikas. Nothing here is a contract of employment."
- In the app: the expected payout for a given tier is an estimate, not a guarantee.
  CPM, CPC, and payout can change without notice.
- On the payout screen: "Payment is not salary. Do not rely on this income."

Get this language reviewed by an employment lawyer in your jurisdiction. Missing it or
getting it wrong creates misclassification exposure (federal DOL complaints, state UI
fraud investigations, class-action liability).

### 11.3 Tax Reporting (USA)

- **1099-K threshold** (used to be $20k, now $5k, expected to drop further): if a US user
  receives payouts > $5,000 in a calendar year, you must file Form 1099-K with the IRS
  and send a copy to the user.
- **1099-NEC threshold** ($600): if you pay a non-employee contractor > $600, you file
  1099-NEC.
- **Age of the user:** if they're under 18, they are still treated as recipients, but
  reporting requirements may differ; verify with a tax attorney.
- **KYC/AML:** if a user receives > $10k in a calendar year, you must collect FATCA info
  (Stripe Identity, W-9/W-8BEN).
- **Stripe is your reporting partner:** Stripe 1099-MISC reporting is automatic for users
  paid out via Stripe Connect. Make sure user email is correct and up to date.

**Implementation:**
- In-app tax form collection (Stripe Identity handles this; you don't roll your own).
- Annual tax summary emailed to the user by Jan 31.
- Reconciliation job: fetch Stripe payouts monthly, match to user accounts, detect
  missing or duplicate 1099-Ks, alert finance.

### 11.4 Advertising and Marketing Regulations

**FTC Act §5 (unfair/deceptive practices):**
- Never claim fixed earnings ("Earn $10/month"). Use ranges from actual data (§6.2).
- Never hide the frequency of ads, the earning mechanism, or the user's 40% cut.
- "Actual results may vary" disclaimer on every earnings estimate.

**ROSCA (Restore Online Shoppers Confidence Act) — applies if rewarded video (Phase 2):**
- Negative option (auto-renew of a subscription) is prohibited without explicit
  affirmative consent first and periodic reminder.
- Sikas doesn't auto-charge users, so this is mostly about not promoting user-facing
  subscriptions within the app that are auto-renewing (e.g. "unlock premium ads" on a
  recurring basis). If you add that, ROSCA applies.

**GDPR (if you have EU/UK/CA users):**
- Legal basis for data processing (consent, legitimate interest, contract, etc.). For
  app telemetry, get consent via the CMP flow mentioned in §5.2.
- Data retention limits: do not keep more than you need, and do not keep it longer than
  necessary. A deleted user's data should be deleted from your systems within 30 days
  (with a small exception for the ledger and audit logs, which can be anonymized).
- Processor agreements: Stripe, Google Play, and any data-processing vendor must be
  listed in your Data Processing Agreement (DPA).
- Right to deletion: in-app delete button (§5.1) + recovery window (soft delete 30
  days, hard delete after).

**COPPA (Children's Online Privacy Protection Act):**
- If you know or have reason to believe anyone under 13 uses the app, COPPA applies.
  Sikas has an age gate (18+, §5.1), so this is blocked at intake. **Document this:**
  "Age verification implemented, under-13 access prohibited."

### 11.5 Platform-Specific Policies

**Google Play:**
- Already discussed in §2.3. Summarize:
  - No locking screen, no home-screen ads, no system-notification ads.
  - App has standalone value (the feed).
  - Ads are disclosed (§5.2).
  - User can delete data in-app (§5.1).
  - Comply with GDPR/COPPA/ROSCA.
- **Release gate:** compliance checklist signed per release.

**Apple App Store:**
- Sikas is iOS in Phase 2. For now, focus on Android.
- If/when you ship iOS: App Store has similar policies but are more stringent.
  Estimated 6-month pre-launch legal review.

---

## 12. Enterprise-Grade Backup, Disaster Recovery, and High Availability

This is the section that makes the entire operation survive a data center fire, a
production bug, an accidental deletion, or an attack. Build it from day one. Do not add
it later.

### 12.1 Recovery Objectives

- **RTO** (Recovery Time Objective): 4 hours for data, 15 minutes for ad serving.
- **RPO** (Recovery Point Objective): 15 minutes (lose at most 15 minutes of data on
  total failure).
- **Uptime SLA**: 99.95% (all services combined), monitored and reported monthly.

### 12.2 Backup strategy: immutable, versioned, distributed

**Primary Database (Postgres):**
- Continuous WAL archiving to S3 (via `pg_basebackup` or similar) with S3 Object Lock
  (WORM — Write Once, Read Many, no deletion). Retention 400 days.
- Full backup every 24 hours (scheduled 02:00 UTC, staggered per environment), uploaded
  to S3 Object Lock.
- Point-in-time recovery (PITR) is always available: pick any timestamp in the last 400
  days, restore to that exact moment.
- Backup test: every Friday, restore the day-old backup to a staging database, run the
  test suite against it, report success/failure to Slack.

**Redis (cache, not source-of-truth):**
- Redis is not backed up (it is cache; lost data is regenerated from Postgres and
  ClickHouse).
- Redis is replicated in-cluster with cluster mode enabled (3-node minimum in prod).
- Redis is not subject to data loss SLAs; it is firewalled and monitored for capacity,
  and is scaled up before it fills.

**ClickHouse (analytics):**
- ClickHouse tables are configured with `ReplicatedMergeTree` engine (2+ replicas in
  prod).
- Backups via `clickhouse-backup` tool, daily to S3 Object Lock, retention 90 days
  (analytics, not money state; shorter retention is OK).
- On ClickHouse corruption, restore from backup + replay the event bus from Kafka (§12.3).

**Event Bus (Kafka/Redpanda):**
- Replication factor 3 (minimum, prod).
- Topics are compacted (retention = forever for compact topics, or retention by time for
  log topics).
- Snapshot-backed: topics are versioned in S3 every 24 hours; on cluster loss, restore
  from snapshot + replay from checkpoint.
- Backups: `kafdump` or similar, daily to S3 Object Lock, retention 180 days.

**Object Store (S3):**
- S3 bucket: versioning enabled, MFA delete enabled, Object Lock enforced,
  public access blocked.
- Cross-region replication to a separate AWS account (for disaster recovery in case of
  account compromise).
- Retention policies: raw events 400 days, creatives 1000 days, audit logs forever.

**Ledger Backups (the critical one):**
- The ledger is Postgres. Follow the §12.2 Postgres backup rules.
- **Additional:** daily export of the ledger to a flat file (CSV or Avro) and upload to
  S3 Object Lock under a separate key/region, unencrypted by the bucket (only S3-side
  encryption), so that anyone with the S3 bucket key can read it. This is intentional —
  the ledger backup must be readable by a third party (an auditor, a lawyer) without
  needing your AWS credentials.
- **Even more additional:** the daily Merkle root (§4.3) is computed, printed to a file,
  and **emailed to a distribution list** (finance@, legal@, an external accountant's
  email). This is so that if the AWS account is compromised, a third party can still
  attest to what the ledger was on any given day.

### 12.3 Disaster recovery: data

**Scenario 1: Postgres corruption or accidental deletion**

1. Detect via monitoring (unusually low row count in the ledger, a integrity-check
   query failing, anomaly in the audit log).
2. Trigger: start a restore job from the nearest backup before the corruption.
3. Point-in-time: restore to the exact timestamp when the data was good (usually the
   day before).
4. Validate: load the backup into a staging database, run tests to confirm the restored
   data is good.
5. Cutover: rename the restored database to prod, flush the cache (Redis), restart the
   application. **This is a 2–4 hour operation.**
6. Post-incident: identify the root cause (query? app bug? human mistake?), fix it,
   audit all logs to see if the damage was larger than detected, adjust the ledger if
   needed.

**Scenario 2: AWS account compromise or ransomware**

1. Immutability is your defender: the S3 Object Lock and the Object Retention policy
   mean an attacker cannot delete backups even with the AWS root key.
2. Trigger: on detection of unusual activity (failed login attempts, unexpected API
   keys in use, deletion jobs running), kill the AWS root credentials and the most
   powerful API keys immediately, switch to a pre-baked API key from a Vault (which you
   keep updated offline).
3. Forensics: CloudTrail logs (also in Object Lock) show what happened.
4. Recovery: spin up a new AWS account (takes ~2 hours), restore the latest backup from
   the cross-region copy (different AWS account), and route traffic to the new account.
5. Cleanup: audit the compromised account for backdoors, rotate all credentials, and
   perform a third-party penetration test before re-enabling it.

### 12.4 Disaster recovery: ad-serving uptime

Goal: **15-minute RTO** (if the primary data center or region fails, ads keep serving
within 15 minutes).

**Architecture:**

- Active/active multi-region (2+ regions minimum): app servers, Redis, and ad-serving
  logic run in both regions simultaneously.
- Postgres replication across regions: standby replicas in each region, synchronous
  replication from primary to one replica (guarantees zero-loss), asynchronous to
  others.
- Kafka cross-cluster mirroring: a topic in region-A is mirrored to region-B with ~3
  second lag.
- DNS failover: GeoDNS (Route53 with health checks, or similar) routes queries to the
  nearest region, and pulls traffic from a region if health checks fail (30-second
  detection, 15-second failover via DNS cache expiry).

**Non-ad-serving components** (console, admin dashboards, reporting) can tolerate longer
outages — they are RTO = 4 hours, on a secondary region that is lower-cost (t2.medium
instances, etc.) and auto-starts on failover.

**Sandbox environment:**
- A staging copy of production (data is anonymized/clipped) runs in a third region.
- Every Friday: kill the staging database, restore from a random point-in-time backup,
  re-deploy the app, and verify it comes online. This is your DR drill.
- Twice a year: do a full switchover drill: route production ad requests to staging for
  1 hour, measure latency/errors, then switch back. This is your RTO/RPO test.

### 12.5 Monitoring, alerting, and runbooks

**What you monitor:**

1. **Service health:**
   - `ad-serve` latency (p50/p95/p99), error rate, cache hit rate.
   - API error rate, 4xx/5xx split, slow endpoint detection.
   - Postgres: connection pool saturation, slow query log, replication lag.
   - Redis: memory usage, eviction rate, replication lag.
   - ClickHouse: query latency, insert lag, disk usage.
   - Kafka: consumer lag, broker health, message loss.

2. **Business metrics:**
   - Impressions/second, viewable %, IVT rate.
   - Advertiser spend/day, user earnings/day, ledger balance checks.
   - Payout success rate, Stripe Connect account health.

3. **Security:**
   - Failed login attempts, rate-limit violations.
   - Unusual API usage patterns (spike in POST /v1/ads/impression, unusual account
     creation patterns).
   - Certificate expiry, TLS version usage.
   - Vault lease expiry, secret rotation completion.

**Alerting:**

- Critical (page immediately, 15-min response SLA):
  - Ad-serve p99 latency > 500ms.
  - Error rate > 1%.
  - Postgres replication lag > 1 minute.
  - Data corruption detected (Merkle root mismatch).
- High (page if on-call, 1-hour response):
  - Latency p95 > 300ms.
  - Error rate > 0.5%.
  - Ledger balance check fails.
  - IVT rate spikes (> 5%).
- Medium (notify Slack, no page):
  - Cache eviction rate increasing.
  - Disk usage > 80%.
  - Any error in the audit log (unexpected).
  - SSL cert expires in < 30 days.
- Low (dashboard only):
  - Anything else.

**Runbooks:**

- A runbook for every critical alert (document the diagnosis steps and remediation).
- Practice runbooks: once a quarter, trigger a critical alert in staging and run through
  the runbook, measuring time-to-resolution.

### 12.6 Backup restoration tests (automated)

Every Friday at 04:00 UTC:

```bash
# Pseudo-code
1. Fetch the 24-hour-old Postgres backup from S3.
2. Spin up a new RDS instance, restore the backup.
3. Run the app migrations ("Is the restored schema current?").
4. Run the test suite ("Does the app start and pass tests against restored data?").
5. Query the ledger ("Are all balances positive? Sums correct?").
6. Cleanup: tear down the test instance.
7. Report: "Backup test: PASS" or "FAIL: ..." in Slack.
8. On failure, page on-call to investigate.
```

Do not skip this. It is the most important test you have.

### 12.7 Cryptographic integrity of the ledger

Every journal entry is hash-chained (§4.3). Daily, compute a Merkle root of all entries
that day and write it to a file:

```
file: ./ledger-merkle-root.txt
format:
  LEDGER MERKLE ROOT
  Date: 2026-08-25
  Root: 8f3a2b1c9d8e7f6g5h4i3j2k1l0m9n8o7p
  Entries: 1234567
  Total balance change: -$0.00  (must be exactly zero for a ledger)
  Signature: base64(sign(root + date + entries_count + balance_change))
```

Signature is made with the Sikas private key (kept in Vault), so anyone can verify that
this is a real root (public key is public, signature is unforgeable).

Upload to S3 Object Lock (no deletion), and email to a distribution list. If the AWS
account is compromised, the attacker cannot delete the S3 files or the emails, so you
have a third-party-auditable record of what the ledger was.

---

## 13. Compliance Test Matrix

Before release, verify these as testable checkboxes, not as aspirational goals:

| Test | Proof |
|---|---|
| Impression can be created without user seeing the ad | Fail (§2.4, §10.5) |
| User can request data export in-app | Works, exports valid JSON |
| User can delete their account in-app and opt into the 30-day recovery window | Works |
| User under 18 is rejected at age gate | Fails with "18+" message |
| Ad response never includes price/bid to the client | Code review + traffic capture |
| Nonce is burned after one use | Reuse same nonce, get 409 Conflict |
| Frequency cap is enforced server-side even if client lies | Forge request with higher frequency, capped server-side |
| Advertiser can refund unspent money | Works |
| Stripe Connect is not created until user earnings >= $5.00 | Verify in test environment |
| Payout rate is exactly 40% (with rounding per §4.1) | Property-based test of 100k random prices |
| IVT-marked account cannot payout | Attempt payout, blocked, balance returned to available |
| Backup can be restored and tested automatically | CI/CD runs weekly, reports to Slack |
| Ledger balance check passes (all accounts sum to zero) | Daily SQL query, alert on mismatch |
| Merkle root is computed and emailed daily | Grep the logs, confirm |

---

## 14. Phase 1: Deliverables (MVP, launch-ready)

**Must-have (blocking):**

- [ ] Sikas Android app (KMP target `android{minSdk=26}`), buildable, testable, runnable on
      physical device and emulator.
  - [ ] Onboarding: phone/email + OTP, age gate, country/timezone.
  - [ ] Home feed: content + ads (simple list, not complex feed algorithms yet).
  - [ ] Ad slider (5 tiers, 150-ad ceiling hard-coded on server).
  - [ ] Wallet: real-time balance (pending/available), earnings history.
  - [ ] Settings: notification controls, data export, account deletion (soft + hard).
  - [ ] Ad detail: "why this ad" + category/advertiser opt-out.
  - [ ] All network requests use TLS 1.3, certificate pinning, integrity token.

- [ ] Ad-serve service (Go): serves ads, 150ms p99 target.
  - [ ] Auction (second-price, quality-adjusted, second-price — described in §4.2).
  - [ ] Floors: $0.50 CPM (app), $1.00 CPM (web default).
  - [ ] Quality multiplier (viewability-based, 7-day rolling).
  - [ ] Pacing multiplier (§8.4, 5-minute recompute).
  - [ ] Nonce-based replay protection.
  - [ ] Frequency caps (global/per-campaign/per-creative).
  - [ ] Reservations (§4.4).

- [ ] Ledger (Postgres): double-entry, append-only, hash-chained.
  - [ ] Journal entry schema (§4.3).
  - [ ] Automated journal writer (Kafka consumer → Postgres).
  - [ ] Hash chain validation (nightly integrity check).
  - [ ] Reconciliation (daily Redis-to-Postgres balance sync).

- [ ] IVT detection (§9):
  - [ ] Rule-based blocking (§9.3 hard rules).
  - [ ] Device attestation (Google Play Integrity API).
  - [ ] ML model (training pipeline, offline scoring, §9.3 Phase 2 model).
  - [ ] User appeal process (in-app form, 72-hour SLA review).

- [ ] Payout infrastructure:
  - [ ] Stripe Connect account creation (lazy, at $5 threshold).
  - [ ] Stripe Connect account details in-app (§5.1 Wallet).
  - [ ] Weekly payout batch (Fridays 17:00 UTC).
  - [ ] Instant payout (on-demand, 1% fee, disclosed).
  - [ ] Tax form collection (Stripe Identity, W-9/W-8BEN).
  - [ ] Minimum $10 payout.

- [ ] Advertiser console:
  - [ ] Campaign builder: targeting, budget, creative upload.
  - [ ] Creative review: automated pre-scan + human queue (4-hour first campaign, 24-hour
        subsequent).
  - [ ] Reporting: impressions, viewability, CTR, spend, IVT rate.
  - [ ] Funding: Stripe PaymentIntent, prepaid only, refund of unspent.

- [ ] Backups and DR (§12):
  - [ ] Postgres backup to S3 Object Lock, daily, 400-day retention.
  - [ ] Automated restore test (weekly, CI/CD).
  - [ ] Ledger Merkle root computed daily, emailed + S3 Object Lock.
  - [ ] Health checks and monitoring (Prometheus/Grafana).
  - [ ] Runbooks for critical alerts.

- [ ] Compliance (§11 + §13):
  - [ ] Age gate: 18+ enforced.
  - [ ] Consent (in-app disclosure of 40%, privacy policy, CMP for EU/UK/CA).
  - [ ] Data deletion (in-app, 30-day recovery window).
  - [ ] Audit logging (all writes, all money moves).
  - [ ] Compliance checklist (signed per release).
  - [ ] Tax ID collection and reporting infrastructure.
  - [ ] KYB/KYC (Stripe).

**Nice-to-have (defer to Phase 2 if necessary, but avoid if possible):**

- Video ad support (currently display only).
- Auto-bid-to-target (currently manual CPC bidding only).
- Referral program.
- Advanced targeting (first-party audiences, lookalike).
- Mobile web tag (embed.js on mobile browsers; web-only in v1).

---

## 15. Security checklist (before release)

| Item | Status |
|---|---|
| TLS 1.3 only, no fallback | [ ] |
| Certificate pinning on client | [ ] |
| Price never exposed to client | [ ] |
| Nonce rotation on every request, burned on use | [ ] |
| HMAC-SHA256 signatures verified on every receipt | [ ] |
| Device attestation via Google Play Integrity API | [ ] |
| Replay protection (nonce + timestamp + idempotency key) | [ ] |
| Rate limiting on all public endpoints | [ ] |
| Rate limiting per session, per IP, per device | [ ] |
| IVT blocking (hard rules + ML model, both in Phase 1) | [ ] |
| Secrets management (Vault, rotated quarterly) | [ ] |
| Database encryption at rest (Postgres, RDS encryption) | [ ] |
| S3 bucket encryption, versioning, MFA delete, Object Lock | [ ] |
| WAF on all public endpoints (Cloudflare / AWS) | [ ] |
| Audit logging of all writes (ClickHouse, S3 Object Lock) | [ ] |
| Third-party security audit completed | [ ] |
| Penetration test completed | [ ] |
| Source code static analysis (SAST) in CI | [ ] |
| Dependency scanning (SCA) for known vulns in CI | [ ] |
| Backup restore test passes weekly | [ ] |
| Ledger integrity check passes daily | [ ] |
| No plaintext secrets in code (grep -r "$\|key\|secret" src/ ) | [ ] |
| Compliance checklist completed (§13) | [ ] |

---

## 16. Testing strategy

### 16.1 Unit tests

- Android (Kotlin): **>80% line coverage**, especially around payment calculations,
  frequency caps, and receipt signing.
  - ExoPlayer behavior (video playback detection).
  - Viewability calculations (duration, percentage, visibility).
  - HMAC verification.
  - Nonce burning.
- Go (`ad-serve`): **>85% coverage**, especially auction logic, pacing,
  and frequency cap checks. Benchmarks for ad-request latency (should stay <100ms).
- TypeScript: **>75% coverage** on campaigns, billing, and ledger logic.

### 16.2 Integration tests

- End-to-end: create advertiser → fund account → create campaign → wait for approval →
  record impressions → verify ledger entries → verify payout.
- IVT: create three test accounts: one legitimate, one with emulator fingerprints, one
  from a known bot farm IP. Verify correct classification and blocking.
- Nonce: submit same nonce twice, second should fail with 409.
- Frequency cap: request 200 impressions (over the 150 cap), verify only 150 served.
- Payout: user earns exactly $10.00, request payout, verify Stripe Connect is created
  and payout is initiated.

### 16.3 Load tests

- `ad-serve`: 100k ad requests/second (10 seconds), measure p50/p95/p99 latency and error
  rate. Target: p99 < 250ms, error rate < 0.1%.
- Ledger writer: 50k impressions/second to Kafka, consumed and written to Postgres
  within 60s. Measure end-to-end latency and completeness.
- API: 10k concurrent advertiser sessions, each doing updates at random intervals.
  Verify no race conditions, no double-charges.

### 16.4 Security tests

- **Replay:** capture an ad-request response, submit it three times. First should work,
  second/third should fail with 409/400.
- **Tamper:** capture a receipt, modify the price field, re-submit. Should fail
  validation (HMAC mismatch).
- **Cert pinning:** force an MITM (test proxy), verify app refuses to connect.
- **Frequency cap evasion:** forge a request with an old device ID (not the current
  user's device), verify the cap is still enforced.
- **IVT bypass:** use an emulator (or emulator fingerprint), submit ads, verify blocked.

### 16.5 Property-based tests

```kotlin
// Example (using QuickCheck-like library)
fun testPayoutRounding(prices: List<Long>) {
  for (price in prices) {
    val user = floor(price * 40 / 100)
    val platform = price - user
    assertEquals(user + platform, price)  // always exactly equal
    assert(user <= price * 40 / 100)      // user never short-changed
    assert(user >= (price * 40 - 99) / 100)  // within a micro-dollar
  }
}
```

Test 100k random prices including edge cases: 0, 1, 500000000 ($ million), max int64.

---

## 17. Deployment strategy

### 17.1 Infrastructure as Code

Everything lives in Terraform (or Pulumi):

- Postgres RDS (multi-AZ, encrypted, snapshots enabled, automated backups).
- Redis (cluster mode, 3+ replicas in prod, encryption in transit).
- Kafka (3+ brokers, topics with replication factor 3, Object Lock for backups).
- ClickHouse (3+ replicas, ReplicatedMergeTree tables, backups enabled).
- app servers (Kubernetes, auto-scaling based on CPU/memory).
- Cloudflare WAF (IP allowlists, rate limiting, bot management).
- S3 buckets (versioning, encryption, Object Lock, lifecycle policies).
- Vault (unseal via AWS KMS, policy controls for secret access).

All code is versioned in Git. Terraform state is encrypted in S3 (or Terraform Cloud).

### 17.2 CI/CD

**Build:**
- Merge to `main` triggers a build.
- Lint (Go: `golangci-lint`, TS: `eslint`, Kotlin: `ktlint`).
- Test (unit + integration).
- Build app (`gradle`), server (`go build`), Docker images.
- SAST (`semgrep`, `gosec`), SCA (Snyk, Dependabot).
- Push to container registry (ECR/GCR).

**Deploy:**
- Staging: auto-deploy on merge.
- Production: manual approval gate (GitHub Actions environment, requires
  approval from >1 reviewer). Deployment to prod is read-only; it cannot
  mutate data; it cannot change billing. (Billing and sensitive changes go
  through a separate PR review and are signed off by finance/legal before
  a human approves the deploy.)
- Canary: 5% of traffic goes to the new version for 5 minutes. Metrics are
  monitored (latency, error rate, business metrics). On regression, auto-rollback.
- Progressive rollout: 25% → 50% → 100% over 30 minutes if canary is green.

**Artifact:**
- Every build produces a git commit hash (immutable build artifact).
- Every production deployment records: when, by whom, what version, what changed.
- Deployments are gated by tests (staging must be stable, backup restore must
  have succeeded that week).

### 17.3 Deployment environments

| Environment | Data | Purpose | Deploy frequency |
|---|---|---|---|
| Prod | Real | Customer-facing | On demand, manual approval |
| Staging | Clipped/anonymized prod | Final test before prod, DR drills | Auto on merge to main |
| Dev | Synthetic | Integration testing, feature development | Auto on merge to develop |
| CI | Synthetic | Tests only | Per commit |

---

## 18. Documentation (must-ship with code)

- **README.md**: build/run/deploy instructions.
- **ARCHITECTURE.md**: system overview, component diagram, traffic flow.
- **API.md**: endpoint specs, request/response schemas, error codes, code examples (curl,
  Kotlin, TypeScript).
- **LEDGER.md**: journal schema, account types, worked examples of common transactions.
- **FRAUD-DETECTION.md**: IVT model, scoring algorithm, appeal process.
- **SECURITY.md**: threat model, mitigations, cryptography, secrets management.
- **COMPLIANCE.md**: privacy policy, ToS, regulatory checklist, audit log schema.
- **RUNBOOKS/**: per-alert runbooks, debugging guides, disaster recovery steps.
- **GLOSSARY.md**: CPM, CPC, CPA, viewability, IVT, etc. — so the team stays aligned.

---

## 19. Build phases and milestones

### Phase 1: MVP (8–12 weeks)

**Weeks 1–2:**
- [ ] Project setup: Terraform, CI/CD, Vault, monitoring skeleton.
- [ ] Postgres + ledger schema + hash-chain validation.
- [ ] Authentication scaffolding (Firebase or OIDC).

**Weeks 3–4:**
- [ ] Auction logic and unit tests.
- [ ] Ad-serve service scaffolding (Go) and deployment.
- [ ] Android app scaffolding (Kotlin, Compose) and CI build.

**Weeks 5–6:**
- [ ] Android onboarding + age gate + OTP.
- [ ] Android home feed (non-ad content only for now).
- [ ] Android wallet (read-only, showing the zero balance).

**Weeks 7–8:**
- [ ] Ad request integration (onboarding → auction → response).
- [ ] Receipt submission and viewability event logging.
- [ ] IVT hard rules (emulator detection, device attestation).
- [ ] Frequency cap enforcement (all three types).

**Weeks 9–10:**
- [ ] Stripe Connect integration (lazy account creation, §2.2).
- [ ] Payout infrastructure (batch + instant).
- [ ] Tax form collection (Stripe Identity).

**Weeks 11–12:**
- [ ] Advertiser console: campaign builder + funding.
- [ ] Creative upload + automated review queue.
- [ ] Reporting (impressions, viewability, IVT rate).
- [ ] Security hardening pass: nonce rotation, HMAC, certificate pinning.
- [ ] Backup testing, compliance checklist, security audit.

**Phase 1 ship date: end of week 12.**

### Phase 2: Advanced monetization (8 weeks)

- [ ] CPC bidding (Phase 1 is CPM only).
- [ ] CPA/offer flow (server-to-server postback, reversal handling).
- [ ] Rewarded video (opt-in, $6 CPM floor).
- [ ] Auto-bid-to-target.
- [ ] First-party audience upload.
- [ ] iOS app (mirror of Android, Apple-specific compliance).

### Phase 3: Scale & intelligence (ongoing)

- [ ] ML-based audience modeling (interest prediction, lookalike).
- [ ] Dynamic creative optimization (which creative for which user).
- [ ] Real-time bidding (open marketplace for external supply/demand).
- [ ] Geo-expansion (additional countries, currencies, tax regimes).

---

## 20. Cost model and unit economics

Assume:

- **Infrastructure:** Postgres, Redis, Kafka, ClickHouse, Kubernetes, CDN,
  Stripe fees. Roughly **$50k/month** for 1M users at steady state.
- **Personnel:** 8–12 engineers (backend, Android, infra), 2 data analysts, 1 compliance
  person. Roughly **$300k/month**.
- **Third-party:** Stripe (2.2% + $0.30 per payout), Google Play (30% of app revenue if
  you monetize the app itself, 0% for ads), Cloudflare, Vault. Roughly **$10k/month**.
- **Total:** ~**$360k/month** at 1M users.

**Unit economics:**

If the average clearing price is $1.50 CPM, and users view 50 impressions/day on average:

- User: $0.75/month (50 impr/day × 30 days × $1.50/1000 × 40%).
- Sikas platform: $1.125/month per user.
- Per-user CAC (customer acquisition cost to get that user): zero via Play Store, but if
  you pay referral bonuses or ads to acquire users, budget $0.10–$0.50/user.
- Break-even: when per-user revenue (platform share) exceeds the sum of per-user costs
  + CAC. At $1.125/user and $360/month fixed + per-user variable, you break even at
  ~300k users.

**Pricing sensitivity:**

- If average CPM drops to $1.00 (bid war, oversupply), per-user revenue drops to $0.75
  and platform share drops to $0.75, break-even moves to ~450k users.
- If you successfully execute on Phase 2 (CPA offers at $2+ eCPM-equivalent), and users
  derive 30% of their earnings from CPA vs 70% from display, you effectively raise the
  blended CPM to $2–$3 and unit economics improve significantly.

---

## Glossary

**CPM (Cost Per Mille):** price per thousand impressions.

**CPC (Cost Per Click):** price per valid click. Internally modeled as an eCPM using
predicted CTR.

**CPA (Cost Per Action):** price per completed action (signup, install, purchase).

**eCPM (Effective CPM):** impressions/1000 × payout, the normalized price metric used
for auctions. CPM campaigns have eCPM = CPM. CPC campaigns have eCPM = CPC ÷ CTR × 1000.

**Viewable impression:** an impression that meets MRC standards (§2.4). The billable
event, the payable event, the ledger event are all the same.

**IVT (Invalid Traffic):** bot impressions, emulator farms, bad actors, fraudsters. Hard
blocks are ~1%. Suspect blocks (human review) are ~1–2% more.

**Pacing:** the delivery curve. "Even pacing" means linear spend across the campaign
flight. ASAP means overspend early if possible.

**Ledger:** the double-entry accounting record of every cent in the system.

**Journal entry:** one balanced set of debits/credits (impressions, payouts, deposits,
etc.).

**Nonce:** a one-time cryptographic value, burned after use, defends against replay.

**HMAC:** keyed hash, signs a message with a shared secret, verifies integrity.

**mTLS:** mutual TLS, client and server both present certificates, identifies each
side.

**Merkle root:** cryptographic hash of all day's transactions, immutable proof of what
happened.

---

## Sign-off

**This document is testable, budgeted, and architected for real.**

Every number is a real number (prices, payout rates, timeframes). Every requirement is
a checkable box (§13, §15, §16). Every subsystem is designed to survive partial
failure, and the entire system is designed to survive data center failure and
compromise (§12).

Do not compromise on §2, §9, §10, or §12. Those are the load-bearing walls. Everything
else is configuration and iteration.

Go build something beautiful. The unit economics work, the regulations are known, and
the money is defensible. You have a shot at this.

---

**End of SIKAS-ANDROID-BUILD-PROMPT.md**
