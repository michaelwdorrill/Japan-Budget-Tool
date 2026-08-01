#!/usr/bin/env -S npx tsx
// Emits /fixtures/expected/<name>.expected.json for every /fixtures/*.json
// trip config, using the TS engine. /verify/verify.R recomputes the same
// totals independently in R and diffs against these files (§1, §9 Phase 3
// gate). Re-run this whenever the engine or seed data changes.

import path from 'node:path'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { computeBudget, loadPriceData } from '../engine/index'
import type { TripConfig } from '../engine/trip'

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const fixturesDir = path.join(rootDir, 'fixtures')
const expectedDir = path.join(fixturesDir, 'expected')

const priceData = loadPriceData(path.join(rootDir, 'data'))

const fixtureFiles = readdirSync(fixturesDir).filter((f) => f.endsWith('.json'))

for (const fileName of fixtureFiles) {
  const config = JSON.parse(readFileSync(path.join(fixturesDir, fileName), 'utf-8')) as TripConfig
  const result = computeBudget(config, priceData)

  const expected = {
    fixture: fileName,
    referenceDate: result.referenceDate,
    totalsByCategory: result.totalsByCategory,
    fixedCostsJpy: result.fixedCostsJpy,
    variableCostsJpy: result.variableCostsJpy,
    contingencyJpy: result.contingencyJpy,
    totalJpyParty: result.totalJpyParty,
    totalJpyPerPerson: result.totalJpyPerPerson,
  }

  const outFileName = fileName.replace(/\.json$/, '.expected.json')
  writeFileSync(path.join(expectedDir, outFileName), `${JSON.stringify(expected, null, 2)}\n`)
  console.log(`wrote fixtures/expected/${outFileName}`)
}
