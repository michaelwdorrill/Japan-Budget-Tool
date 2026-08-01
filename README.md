# Japan Trip Budget Estimator

A static, client-side SPA that turns qualitative trip choices into a
per-person budget for a trip to Japan, with an honest uncertainty range.
See `japantripbudgetspec.md` for the full build spec.

Status: Phase 6 (uncertainty and sensitivity) — the wizard's headline
number is now the Monte Carlo P80, not a single point estimate. The
guidance rules engine is still to come.

## Stack

React + TypeScript (strict) + Vite, deployed to GitHub Pages. All
computation is client-side and pure-functional; there is no backend.
`/engine` is the DOM-free cost engine; `/data` is the versioned price data
it reads.

## Development

```bash
npm install
npm run dev              # local dev server
npm run lint              # eslint
npm test                  # vitest
npm run test:coverage     # vitest with coverage (engine/ gate: >=90% branches)
npm run validate:data     # JSON Schema validation + staleness report for /data
npm run build              # tsc -b && vite build
```

## Budget engine CLI

```bash
npm run budget -- fixtures/golden-route.json
```

Prints a full line-item breakdown for a trip config JSON file, plus the
top 3 intercity transport options (point-to-point vs. national/regional
passes vs. discount-product substitutions) with cost, added travel time,
and a one-line "why" (§4.2). See `/fixtures` for example configs.

## R cross-check

The TS engine's arithmetic is independently reimplemented in R
(`/verify/verify.R`) and diffed against every fixture in `/fixtures` to
catch modeling bugs a single implementation could hide (§1, §9 Phase 3 —
"the most important gate in the build"). Requires R with the `jsonlite`
package:

```bash
npm run generate:fixtures   # emits /fixtures/expected/*.json from the TS engine
Rscript verify/verify.R     # recomputes independently in R, diffs to the yen
```

## UI wizard

`npm run dev` and open the local URL for the 7-step wizard (§5.3): who and
when, where, sleep, eat, do, getting around, and money, with a running
total in the sidebar. The entire trip is encoded into the URL's `t` query
param (compressed with `lz-string`) — that's the persistence mechanism,
no accounts or localStorage. Copy the address bar to share or restore a
trip in a fresh browser.

## Uncertainty (§3.3)

Every line item carries a low/expected/high band (`engine/*.ts`, via
`multiplyByBasisRange`); rail fares and pass prices — real published,
exact prices — are modeled as a point mass rather than a fabricated
range. Two roll-up modes:

- **Monte Carlo** (default, `engine/monteCarlo.ts`): 10,000 seeded PERT
  trials. All lodging line items share one multiplicative market factor
  per trial (`Normal(1.0, 0.08)`), and all food line items share a second,
  independent one — so a bad week for Tokyo hotels is a bad week for
  Kyoto hotels too, rather than 40 independent draws collapsing the range
  toward the mean. FX is drawn per trial and applied once, converting
  that trial's JPY total to USD. Reports P10/P50/P80/P90; the wizard's
  headline is P80, debounced ~300ms after the config settles (10k trials
  takes ~100-150ms, too slow for every keystroke but fine settled).
- **Additive envelope** (`computeAdditiveEnvelope`): sum every line's low,
  sum every line's high — the "everything goes wrong / everything goes
  right" honest-but-too-wide-to-budget-to bound.

`engine/sensitivity.ts` recomputes the deterministic total with each of 8
inputs (nights, lodging tier, party size, dinner tier, splurge meal count,
FX rate, intercity strategy, activity fallback tier) moved one notch up
and down, sorted by impact — the tornado-chart ordering.
