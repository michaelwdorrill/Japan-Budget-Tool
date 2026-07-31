# Japan Trip Budget Estimator

A static, client-side SPA that turns qualitative trip choices into a
per-person budget for a trip to Japan, with an honest uncertainty range.
See `japantripbudgetspec.md` for the full build spec.

Status: Phase 0 (scaffold) — no budgeting functionality yet.

## Stack

React + TypeScript (strict) + Vite, deployed to GitHub Pages. All
computation is client-side and pure-functional; there is no backend.

## Development

```bash
npm install
npm run dev      # local dev server
npm run lint      # eslint
npm test          # vitest
npm run build     # tsc -b && vite build
```
