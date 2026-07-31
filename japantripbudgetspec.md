# Japan Trip Budget Estimator — Build Spec

**Target builder:** Claude Code
**Spec version:** 1.0
**Date:** 2026-07-31
**Goal:** Given a set of qualitative trip choices, produce a defensible **per-person budget** for a trip to Japan, with an honest uncertainty range and an explanation of what drives the number.

---

## 0. Design thesis (read this before building anything)

Three commitments shape every decision below. Do not silently trade them away.

1. **The output is a distribution, not a number.** "How much will this cost?" answered with a single figure is a lie. Every line item carries a low/expected/high estimate; the app reports P10 / P50 / P80 / P90 and tells the user to budget to **P80**. The headline number is the P80.

2. **Every cost knows how it scales.** The single most common failure in trip budget spreadsheets is multiplying a per-room hotel rate by the number of people, or forgetting that a ryokan rate is per-person-with-meals. Every price record in the dataset carries an explicit `basis` field, and the engine multiplies by party size *only* when the basis says to.

3. **Compute in JPY, display in USD.** All arithmetic happens in integer yen. Currency conversion happens exactly once, at the display boundary. The FX rate is a user-controlled input with a stress test, not a hardcoded constant. As of 2026-07-31 USD/JPY traded around 159–160 after moving roughly 2.4% in a single session — the rate is a material budget risk, not a rounding detail.

---

## 1. Stack

### Recommendation: static SPA, no backend

- **React + TypeScript + Vite**, deployed to GitHub Pages.
- **All computation client-side.** No server, no database, no API keys, no hosting cost.
- **Price data lives in versioned JSON files** in `/data`, loaded at startup.
- **Full app state serialized into the URL** (compressed base64 query param) so a configured trip is a shareable link. This is also the persistence mechanism — no accounts, no localStorage.

Rationale: this mirrors the architecture that already worked for Concord (static, GitHub Pages, no backend), keeps the "let other people use it" rollout path free, and makes the cost engine a set of pure functions that are trivial to unit-test.

### R cross-check harness (do build this)

Michael's primary language is R. The cost engine must therefore be structured so it can be independently reimplemented and verified:

- `/data/*.json` is the **single source of truth for prices** and is plain JSON with no TypeScript-specific structure.
- `/fixtures/*.json` contains ~8 fully specified trip configurations.
- `/verify/verify.R` loads the same `prices.json` and the same fixtures, recomputes the deterministic totals independently, and diffs against `/fixtures/expected/*.json` emitted by the TS engine.
- CI runs both. A divergence greater than ¥1 fails the build.

This is not ceremony. Two independent implementations of the same arithmetic is the cheapest real correctness guarantee for a model like this, and it puts the modeling surface in a language the owner can extend without touching the frontend.

### Rejected alternatives (and why)

| Option | Why not |
|---|---|
| R Shiny | Native language, Monte Carlo is one line, plotting is excellent. But hosting is a real constraint (shinyapps.io free tier sleeps and caps hours), share-by-link is awkward, and the "let others use it" rollout gets worse rather than better. Reconsider if the app stays private and the modeling keeps churning. |
| Python + FastAPI + React | Requires a server for no benefit. Nothing here needs a backend — there is no auth, no persistence, no secret. |
| C# / Blazor WASM | Would satisfy the C# interest and gives a genuinely nice typed domain model. Costs a much heavier toolchain and a bigger WASM payload for a small app. Viable if the goal is C# practice rather than the trip. |
| Spreadsheet | Handles the arithmetic fine, handles the JR Pass window optimization and the correlated Monte Carlo badly, and cannot be shared as a working tool. |

---

## 2. Domain model

### 2.1 Cost basis taxonomy — the core abstraction

```ts
type CostBasis =
  | 'per_room_per_night'      // business hotels, Western hotels, Airbnb
  | 'per_person_per_night'    // ryokan with meals, hostel beds, lodging tax
  | 'per_person_per_day'      // food, local transit, incidentals
  | 'per_person_per_leg'      // intercity rail/air fares
  | 'per_person_per_trip'     // flights, JR Pass, departure tax, insurance, eSIM
  | 'per_party_per_trip'      // pocket wifi, one shared rental car, one guide
  | 'per_person_per_use';     // a single named activity or splurge meal

interface PriceRecord {
  id: string;
  label: string;
  cityId?: string;
  category: Category;
  tier?: Tier;
  basis: CostBasis;
  low: number;        // JPY, integer
  expected: number;   // JPY, integer
  high: number;       // JPY, integer
  asOf: string;       // ISO date — when this price was last verified
  source: string;     // URL or citation
  confidence: 'high' | 'medium' | 'low';
  notes?: string;
}
```

The engine's multiplication step is a single `switch` on `basis`. Never multiply anywhere else.

### 2.2 Trip configuration

```ts
interface TripConfig {
  party: {
    adults: number;
    children: { age: number }[];   // matters: JR fares half price 6–11, free under 6
    rooms: number;                  // default ceil(people / 2), user-overridable
  };

  timing: {
    startDate: string | null;       // exact date if known
    season: SeasonId | null;        // else pick a season window
    nights: number;                 // total; must equal sum of leg nights
  };

  itinerary: {
    arrivalAirport: AirportId;      // NRT | HND | KIX | ITM | CTS | FUK | NGO
    departureAirport: AirportId;    // open-jaw supported and encouraged
    legs: Leg[];
  };

  flight: {
    mode: 'points' | 'cash' | 'exclude';
    cashEstimateUsd?: number;
    taxesAndFeesUsd: number;        // ALWAYS charged, even on award tickets
    pointsUsed?: number;            // display-only opportunity cost
    centsPerPoint?: number;         // display-only
  };

  money: {
    jpyPerUsd: number;
    fxStressPct: number;            // ± band, default 10
    cardFxFeePct: number;           // 0 for a no-FX-fee card, else 3
    cashJpyPerPersonPerDay: number; // how much they'll pull from ATMs
    contingencyPct: number;         // default 10, applied to variable costs only
  };

  transport: {
    strategy: 'auto' | 'point_to_point' | ExplicitPassId;
    railClass: 'ordinary' | 'green';
    luggageForwarding: boolean;
  };

  preset?: 'lean' | 'comfortable' | 'splurge';   // seeds all tiers at once
}

interface Leg {
  cityId: CityId;
  nights: number;
  lodgingTier: LodgingTier;
  food: {
    breakfast: FoodTier;
    lunch: FoodTier;
    dinner: FoodTier;
  };
  activities: ActivitySelection[];  // named picks with real prices
  activityTierFallback: ActivityTier; // for unplanned days
  dayTrips: DayTripId[];
  splurgeMeals: number;             // count of high-end dinners on this leg
}
```

### 2.3 Tiers

Tiers are **named with concrete referents**, not adjectives. "Nice hotel" means nothing; "boutique / 4-star Western, ~¥40,000/room/night in Tokyo" means something. Every tier label in the UI shows a real example property type and the resulting nightly figure.

**Lodging (per city, since the same tier costs very different amounts in Tokyo vs Takayama):**

| Tier | Referent |
|---|---|
| `hostel` | Dorm bed or capsule. Basis: per_person_per_night. |
| `business` | APA / Toyoko Inn / Dormy Inn. Small room, spotless, per-room. |
| `midrange` | 3–4 star Western or good boutique. |
| `upscale` | 4–5 star international brand, or a well-regarded ryokan. |
| `luxury` | Aman / Park Hyatt / high-end kaiseki ryokan. Triggers the Kyoto tax cliff. |
| `ryokan_hanmeshi` | Special case: **per-person, includes dinner and breakfast.** When selected, the engine must zero out that leg's dinner and breakfast food cost. Getting this wrong double-counts ~¥15,000/person/night. |

**Food, per meal slot** — this is deliberately three dials rather than one, because the realistic pattern is konbini breakfast, cheap lunch, and a real dinner, and a single "food niceness" slider produces nonsense at both ends.

| Tier | Breakfast | Lunch | Dinner |
|---|---|---|---|
| `konbini` | onigiri + coffee | konbini or supermarket | — |
| `casual` | hotel/chain | ramen, teishoku, standing soba | izakaya, gyudon, ramen |
| `standard` | café | good set lunch | sit-down izakaya or yakiniku |
| `nice` | hotel buffet | mid-tier restaurant | reservation-worthy restaurant |
| `splurge` | — | high-end lunch course | kaiseki / sushi omakase |

Plus a separate **splurge meal counter** per leg. A single sushi omakase or kaiseki dinner runs ¥20,000–60,000 per person. Two of those on a two-week trip can be 8–12% of the entire budget, and they do not belong inside a daily average — averaging them across 14 days hides the decision the user actually wants to see.

**Activities:** a real picklist per city with actual named items, prices, and durations (teamLab, Ghibli Museum, Shibuya Sky, sumo tournament, Universal Studios, day tours, cooking classes, temple entries, onsen day passes), plus an `activityTierFallback` for unplanned days (`free_walking` / `light` / `standard` / `premium`) so the model doesn't assume zero spend on days without an explicit plan.

---

## 3. The cost engine

Pure functions. No React, no I/O, no dates library dependency in the core. `engine/` should compile and run under plain `node` with no DOM.

```
computeBudget(config, priceData) -> BudgetResult
```

### 3.1 Category structure

```
A. Getting there
   A1. International airfare (or 0 if points)
   A2. Award taxes, fees, carrier surcharges  ← ALWAYS non-zero
   A3. Japan international tourist departure tax
   A4. Home-side transport (to/from home airport, parking)
   A5. Travel insurance

B. Lodging
   B1. Room/bed cost per leg
   B2. Municipal accommodation tax  ← computed, not estimated
   B3. Onsen/bathing tax where applicable

C. Intercity transport
   C1. Rail fares OR pass cost (see optimizer, §4)
   C2. Nozomi/Mizuho supplements if a pass is used
   C3. Seat reservations, oversized-luggage reservations
   C4. Domestic flights where relevant
   C5. Airport transfers (N'EX, Skyliner, Haruka, limousine bus)
   C6. Luggage forwarding (takkyubin)

D. Local transport
   D1. IC card daily spend per city
   D2. City transit passes where they beat pay-as-you-go
   D3. Taxis (late nights, luggage days)

E. Food
   E1–E3. Breakfast / lunch / dinner by tier by city
   E4. Splurge meals
   E5. Drinks, coffee, konbini snacks (separate line; it is not small)

F. Activities and admissions

G. Connectivity and services
   G1. eSIM or pocket wifi
   G2. Coin lockers, laundry

H. Shopping and gifts
   H1. Souvenirs/omiyage budget
   H2. Personal shopping budget (user-set; default 0 with a nudge)

I. Reserves
   I1. Contingency (% of variable costs B–H, not of fixed costs)
   I2. FX buffer
```

### 3.2 Accommodation tax — implement properly

This is a bracketed function of the **nightly room rate**, charged **per person per night**, and it varies by municipality. It is not a percentage and it is not a rounding error at the top end.

```ts
function lodgingTax(cityId, nightlyRateJpy, nights, people, date): number
```

Seed data (verify all of it at build time — see §8):

- **Kyoto**, effective 2026-03-01, five tiers per person per night:
  under ¥6,000 → ¥200; ¥6,000–19,999 → ¥400; ¥20,000–49,999 → ¥1,000; ¥50,000–99,999 → ¥4,000; ¥100,000+ → ¥10,000.
  The cliff at ¥100,000 is brutal: a couple in a ¥120,000 suite pays ¥20,000/night in tax alone. **The app must detect proximity to a bracket edge and warn**, because a ¥99,999 room and a ¥100,000 room are functionally identical and differ by ¥6,000/person/night in tax.
- **Tokyo:** ¥100–200 per person per night (fixed-fee system for 2026; a move to a 3% percentage-based tax has been announced for FY2027 — model it as a dated rule so the switch is a data change, not a code change).
- **Osaka:** ¥100–300 per person per night.
- **Niseko:** ¥2,000 per person per night.
- Roughly a dozen other municipalities levy one, with many more approved or under consideration — structure the data so adding a city is one JSON record.
- **Departure tax:** ¥3,000 per person, collected in the airfare. *Verify — sources conflict with an older ¥1,000 figure.*

### 3.3 Uncertainty roll-up

Implement **both** modes and let the user toggle:

**Mode 1 — additive envelope.** Sum all lows, sum all highs. This assumes perfect correlation and produces a range that is too wide to be useful for budgeting but is honest about the worst case. Label it "everything goes wrong / everything goes right."

**Mode 2 — Monte Carlo (default).** 10,000 trials, seeded PRNG so results are reproducible and shareable.

- Each line item draws from a **PERT distribution** parameterized by (low, expected, high). PERT rather than triangular because it weights the modal estimate more heavily, which matches how these estimates are actually constructed.
- **Costs are not independent.** Introduce a shared multiplicative market factor `M ~ Normal(1.0, 0.08)` applied across all lodging lines, and a second factor across all food lines. If Tokyo hotels are expensive that week, Kyoto hotels are too. Treating 40 line items as independent draws makes the range collapse toward the mean by roughly √n and produces a falsely precise answer — this is the single most common modeling error in tools like this.
- FX is drawn separately and applied at the end, so its contribution is visible in the tornado chart.

Report P10 / P50 / P80 / P90. **The headline figure is P80.** Label it explicitly: "Budget this much and you have roughly a 4-in-5 chance of coming in under."

### 3.4 Sensitivity analysis

Cheap and high-value. For each input, recompute the total with that input moved one notch up and one notch down, holding everything else fixed. Render as a tornado chart sorted by absolute impact.

Expected ordering, roughly: nights → lodging tier → party size → dinner tier → splurge meal count → FX rate → intercity strategy → activities. Showing this ordering *is the product's real advice* — it tells the user which decisions matter and which are noise.

---

## 4. Intercity transport optimizer

This is the highest-value non-obvious feature. Build it as its own module with its own tests.

### 4.1 The problem

Since the October 2023 price increase, the national JR Pass is no longer an automatic buy. A 7-day ordinary pass is ¥50,000 and requires averaging roughly ¥7,140/day in JR value to break even. A Tokyo–Kyoto round trip is about ¥26,640 — barely half the pass. Most two-city itineraries lose money on it.

**Pricing note requiring verification:** the 7-day ordinary pass is ¥50,000 as of mid-2026, with an announced increase to ¥53,000 for purchases through **overseas agents** from 2026-10-01; the official online channel is expected to hold the lower price for a limited, unannounced window. 14-day: ¥80,000 → ¥84,000. 21-day: ¥100,000 → ¥105,000. Green Car 7-day: ¥70,000 → ¥74,000. Children 6–11 pay half. Model the price as a function of `(purchaseDate, channel)`.

### 4.2 Algorithm

Given ordered legs with dates, generate the required set of intercity journeys, then evaluate:

1. **Point-to-point**, all journeys at individual fares (base fare + limited express surcharge; reserved vs unreserved).
2. **National JR Pass**, 7/14/21 day, ordinary and green. Because the pass is a window of *consecutive* days, the optimizer must slide the activation window across the trip and pick the placement that captures maximum fare value. Add Nozomi/Mizuho supplements (~¥4,960 Tokyo–Kyoto per ride) or route via Hikari/Sakura with a 20–30 minute penalty, and surface that as a time-vs-money tradeoff.
3. **Regional passes**: JR East (Tohoku / Nagano-Niigata), JR West Kansai-Hiroshima and Sanyo-San'in, JR Central Takayama-Hokuriku, JR Kyushu, JR Hokkaido. These frequently beat the national pass and are the actual right answer for most itineraries.
4. **Discount products**: Puratto Kodama (discounted slow shinkansen), Seishun 18 (seasonal), highway buses, overnight buses.
5. **Domestic LCC** (Peach, Jetstar) plus airport transfer time and cost, for long hops like Tokyo→Fukuoka or anything to Hokkaido/Okinawa. Compare on total door-to-door cost *and* elapsed time.
6. **ANA/JAL foreign-visitor domestic fares** where eligibility applies.

Output a ranked list with: total cost, savings vs baseline, added travel time, and a one-line "why." Default to `auto` and show the top three.

### 4.3 Luggage forwarding

If the itinerary has ≥3 city changes, or any leg involves a shinkansen with oversized luggage, recommend takkyubin and add the line (~¥2,000–2,500 per bag per transfer). It is cheap, and it interacts with the oversized-luggage reservation requirement on the Tokaido shinkansen.

---

## 5. Guidance layer

The user asked for help with considerations they don't know to raise. Implement this as a **rules engine over the config**, not as a static FAQ. Each rule: a predicate, a severity, a message, and where relevant a cost delta and a booking deadline.

### 5.1 Timing and seasonality rules

Seasonal lodging multipliers are large — 1.4× to 2.2× on lodging, with availability collapsing:

- **Cherry blossom**, late March–early April: peak lodging, book 6+ months out.
- **Golden Week**, Apr 29–May 5: domestic travel peak, avoid if possible.
- **Obon**, mid-August: same, plus heat and humidity.
- **New Year**, Dec 28–Jan 4: many businesses closed, transport packed.
- **Autumn foliage**, November: Kyoto especially.
- **Shoulder sweet spots**: mid-May to mid-June (pre-rainy season), late September to late October.

**Feature:** when the selected window overlaps a peak, compute and display the counterfactual — "shifting this trip to mid-May reduces the P80 by $X per person." That is a concrete, actionable number and it is the single most valuable piece of advice the tool can give.

### 5.2 Rules to implement

| Trigger | Message |
|---|---|
| Kyoto + lodging rate within 10% of a tax bracket edge | Bracket cliff warning with the exact delta |
| Ryokan-with-meals selected | Dinner and breakfast zeroed for that leg; confirm this is right |
| Ryokan or onsen selected | Tattoo policies vary; check before booking |
| ≥3 city changes | Recommend luggage forwarding; show the cost |
| Any leg | Advance-booking items with lead times: Ghibli Museum (lottery, ~1 month), teamLab, Shibuya Sky, sumo (tournament months only — Jan/Mar/May/Jul/Sep/Nov), Universal Studios express passes, high-end restaurants (some require 1–3 months) |
| Trip > 10 days | Laundry line item; consider packing lighter |
| Nights in Tokyo > 5 with day trips | Compare base-and-day-trip vs relocating |
| Kyoto lodging cost high | Suggest Osaka base with Kyoto day trips; compute the delta |
| Always | Cash: Japan is increasingly cashless but temples, small restaurants, and rural areas are cash-only. 7-Eleven and Japan Post ATMs accept foreign cards |
| Always | Tax-free shopping on purchases ≥¥5,000 at registered stores; passport required |
| Always | Consumption tax is 10% and normally *included* in displayed prices — do not add it again |
| Card FX fee > 0 | Show the dollar cost of the fee; a no-FX-fee card saves $X on this trip |
| US passport | No visa for stays ≤90 days, but confirm current entry requirements — a pre-travel electronic authorization system has been under discussion |
| Always | Passport validity, travel insurance, prescription medication rules (some common US medications are restricted in Japan — a genuine trap) |
| Party includes children | Fare rules: free under 6, half price 6–11; lodging occupancy limits are strict in Japan |

### 5.3 Wizard flow

Seven steps, each with a running budget in the corner that updates live. Every step must be skippable with a sensible default — a user who answers nothing should still get a plausible number, and the guidance layer should tell them which defaults are load-bearing.

1. Who and when (party, dates or season, nights)
2. Where (city picker → drag-to-order itinerary with a nights allocator; suggest presets: "Golden Route 10 nights," "Kansai deep dive," "Tokyo + Hakone + Kyoto")
3. Where you'll sleep (lodging tier per leg, with a global default)
4. What you'll eat (three meal dials + splurge counter, per leg or globally)
5. What you'll do (activity picklist + fallback tier)
6. Getting around (auto-optimizer result shown with alternatives)
7. Money (flights/points, FX, contingency, card fees)

---

## 6. Outputs

- **Headline card:** P80 per person, in USD, with the JPY figure and the FX rate used stated underneath. Secondary: P50, and total for the whole party.
- **Stacked bar by category**, per person, with a per-day burn rate.
- **Table by city** — cost per night in each city makes the Kyoto-vs-Osaka and Tokyo-vs-elsewhere tradeoffs legible.
- **Tornado chart** (sensitivity).
- **Distribution histogram** with P10/P50/P80/P90 markers.
- **Scenario comparison:** save and compare up to three configurations side by side. Seed with Lean / Comfortable / Splurge presets so the first-time user immediately sees the range of the decision space.
- **"What if" panel:** FX slider, season shift, one fewer night, one tier down on lodging — each showing the delta live.
- **Export:** JSON (round-trips back into the app), CSV of line items, and a print stylesheet that produces a clean one-page summary.

### Design direction

Reference material, not a travel brochure. No cherry blossoms, no torii gates, no stock photography — the subject is *money*, and the visual identity should come from Japanese transit and financial ephemera: the typographic density of a JR timetable, the tabular restraint of a fare chart, monospace numerals throughout so figures align in columns. Numbers are the hero; let them be large and set in a face that makes tabular data pleasant. Pick a signature element — the tornado chart or the per-day burn strip are both good candidates — and keep everything around it quiet.

---

## 7. Multi-user rollout (build the seams now, fill them later)

The v1 is for one person with points. Do not hardcode that.

- `flight.mode` is already a three-way toggle. In v1, `cash` mode accepts a manual USD estimate. In v2, add an origin-airport input and a coarse fare table by origin region and season.
- Nothing else is user-specific. Party size, currency, and card fees are already parameters.
- **Optional display-only line:** opportunity cost of points, `pointsUsed × centsPerPoint`. Shown separately and **excluded from the cash budget total**, since it isn't money leaving the bank account. Useful for deciding whether the points are better spent elsewhere, but it must never be conflated with the budget figure.
- Home-currency support: the FX layer already handles this; add a currency picker and the display layer follows.

---

## 8. Data sourcing — read carefully

**The seed prices in this spec are anchors, not verified data.** Several were checked against sources on 2026-07-31; most were not. Before Phase 2 completes:

1. Verify every record with `confidence: 'low'` or an `asOf` older than 90 days.
2. Record `source` as a real URL for each.
3. Where sources conflict (the JR Pass channel pricing and the departure tax amount both currently conflict across sources), record both, take the more specific/more recent, and note the conflict in `notes`.
4. Emit a build-time report of every record older than 180 days.
5. In the UI, show `data as of <date>` in the footer and a visible banner if any load-bearing record is older than 180 days. **Do not let this app quietly serve stale prices** — a budget tool that is confidently wrong is worse than no tool.

Prices to check at build time, at minimum: JR Pass tiers and channel pricing, per-city lodging by tier, shinkansen fares for all modeled city pairs, accommodation tax schedules, departure tax, airport transfer fares, and the major named activities.

---

## 9. Build phases

Each phase has a gate. **Do not start the next phase until the gate passes.** Do not build any UI before Phase 3 passes.

**Phase 0 — Scaffold.** Vite + React + TS, strict mode, Vitest, ESLint, GitHub Actions, Pages deploy. Types from §2 defined, nothing implemented.
*Gate:* empty app deploys to Pages; `npm test` runs.

**Phase 1 — Data.** `/data/cities.json`, `prices.json`, `rail-fares.json`, `passes.json`, `taxes.json`, `activities.json`, `seasons.json`. JSON Schema for each, validated in CI. Seed with 8 cities: Tokyo, Kyoto, Osaka, Hakone, Nara, Hiroshima, Kanazawa, Takayama.
*Gate:* schema validation passes; every record has `basis`, `asOf`, `source`, `confidence`.

**Phase 2 — Deterministic engine.** Pure functions, expected-value only, no uncertainty. All categories from §3.1 including the tax function.
*Gate:* ≥90% branch coverage on `engine/`; hand-computed fixture matches to the yen.

**Phase 3 — CLI harness + R cross-check.** `npm run budget -- fixtures/golden-route.json` prints a full line-item breakdown. `/verify/verify.R` reproduces it.
*Gate:* all 8 fixtures agree between TS and R within ¥1. **This is the most important gate in the build.**

**Phase 4 — Transport optimizer.** §4 in full, with its own fixture set.
*Gate:* known-answer tests — a Tokyo/Kyoto/Osaka 7-night trip must correctly reject the national pass; a Tokyo/Hiroshima/Kanazawa/Tokyo trip must correctly accept it.

**Phase 5 — UI wizard.** §5.3, running total, URL state serialization.
*Gate:* a configured trip survives a copy-paste of the URL into a fresh browser.

**Phase 6 — Uncertainty and sensitivity.** Monte Carlo with correlation, PERT sampling, tornado chart, distribution histogram.
*Gate:* seeded runs are reproducible; a correlated run produces a visibly wider P10–P90 band than an independent run (this is the regression test for the correlation bug in §3.3).

**Phase 7 — Guidance rules engine.** §5.2, declarative rule definitions in a data file, not in component code.
*Gate:* every rule has a fixture that triggers it and one that doesn't.

**Phase 8 — Scenarios, export, print, polish.**

**Phase 9 — Multi-user seams.** §7.

---

## 10. Non-goals

- Not a booking tool. No live availability, no affiliate links, no inventory.
- Not an itinerary planner. It does not optimize what to see or in what order; it prices a plan the user brings.
- No live price scraping. Curated versioned data with visible staleness beats a fragile scraper that silently rots.
- No accounts, no analytics, no tracking.
