# Japan Trip Budget Estimator

A static, client-side SPA that turns qualitative trip choices into a
per-person budget for a trip to Japan, with an honest uncertainty range.
See `japantripbudgetspec.md` for the full build spec.

Status: Phase 3 (CLI harness + R cross-check) — deterministic cost engine
is implemented and independently verified; no UI yet.

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

Prints a full line-item breakdown for a trip config JSON file. See
`/fixtures` for example configs.

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
