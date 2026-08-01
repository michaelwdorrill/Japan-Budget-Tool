# Japan Trip Budget Estimator

A static, client-side SPA that turns qualitative trip choices into a
per-person budget for a trip to Japan, with an honest uncertainty range.
See `japantripbudgetspec.md` for the full build spec.

Status: Phase 5 (UI wizard) — a working 7-step wizard over the
deterministic engine, with the full trip state serialized into a
shareable URL. Uncertainty (Monte Carlo/P80) and the guidance rules
engine are still to come.

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
