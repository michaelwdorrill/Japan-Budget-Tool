#!/usr/bin/env -S npx tsx
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { computeBudget, computeGuidance } from '../engine/index'
import { loadPriceData } from '../engine/loadPriceData'
import type { TripConfig } from '../engine/trip'
import type { Category } from '../engine/price'

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

function formatJpy(amountJpy: number): string {
  return `¥${amountJpy.toLocaleString('en-US')}`
}

const CATEGORY_LABELS: Record<Category, string> = {
  getting_there: 'A. Getting there',
  lodging: 'B. Lodging',
  intercity_transport: 'C. Intercity transport',
  local_transport: 'D. Local transport',
  food: 'E. Food',
  activities: 'F. Activities and admissions',
  connectivity: 'G. Connectivity and services',
  shopping: 'H. Shopping and gifts',
  reserves: 'I. Reserves',
}

const CATEGORY_ORDER: Category[] = [
  'getting_there',
  'lodging',
  'intercity_transport',
  'local_transport',
  'food',
  'activities',
  'connectivity',
  'shopping',
  'reserves',
]

function main() {
  const fixturePath = process.argv[2]
  if (!fixturePath) {
    console.error('usage: npm run budget -- <fixture.json>')
    process.exit(1)
  }

  const resolvedFixturePath = path.isAbsolute(fixturePath) ? fixturePath : path.join(process.cwd(), fixturePath)
  const config = JSON.parse(readFileSync(resolvedFixturePath, 'utf-8')) as TripConfig
  const priceData = loadPriceData(path.join(rootDir, 'data'))

  const result = computeBudget(config, priceData)

  console.log(`Japan Trip Budget Estimator — ${path.basename(resolvedFixturePath)}`)
  console.log(`Reference date: ${result.referenceDate}`)
  console.log('='.repeat(72))

  for (const category of CATEGORY_ORDER) {
    const items = result.lineItems.filter((item) => item.category === category)
    if (items.length === 0 && category !== 'reserves') continue

    console.log(`\n${CATEGORY_LABELS[category]}`)
    for (const item of items) {
      const cityTag = item.cityId ? ` [${item.cityId}]` : ''
      console.log(`  ${item.subcategory.padEnd(4)} ${item.label}${cityTag}`.padEnd(58) + formatJpy(item.amountJpy).padStart(14))
    }
    if (category === 'reserves') {
      console.log(`  I1   Contingency (${config.money.contingencyPct}% of variable costs)`.padEnd(58) + formatJpy(result.contingencyJpy).padStart(14))
    }
    console.log(`  ${'-'.repeat(56)}`)
    console.log(`  Subtotal`.padEnd(58) + formatJpy(result.totalsByCategory[category]).padStart(14))
  }

  console.log(`\n${'='.repeat(72)}`)
  console.log(`Fixed costs (A)`.padEnd(58) + formatJpy(result.fixedCostsJpy).padStart(14))
  console.log(`Variable costs (B-H)`.padEnd(58) + formatJpy(result.variableCostsJpy).padStart(14))
  console.log(`Contingency (I1)`.padEnd(58) + formatJpy(result.contingencyJpy).padStart(14))
  console.log(`${'-'.repeat(72)}`)
  console.log(`TOTAL (party)`.padEnd(58) + formatJpy(result.totalJpyParty).padStart(14))
  console.log(`TOTAL (per person)`.padEnd(58) + formatJpy(result.totalJpyPerPerson).padStart(14))

  if (result.pointsOpportunityCostUsd > 0) {
    console.log(`\nPoints opportunity cost (display-only, not in total): $${result.pointsOpportunityCostUsd.toFixed(2)}`)
  }

  for (const { cityId, warning } of result.bracketEdgeWarnings) {
    console.log(
      `\n⚠ ${cityId}: lodging rate is within the warning threshold of a tax bracket edge at ¥${warning.edgeJpy.toLocaleString('en-US')}/person/night (Δ¥${warning.taxDeltaJpyPerPersonPerNight.toLocaleString('en-US')}/person/night if it crosses).`,
    )
  }

  if (result.transportOptions.length > 1) {
    console.log(`\nIntercity transport options (top ${Math.min(3, result.transportOptions.length)} of ${result.transportOptions.length}, §4.2):`)
    for (const option of result.transportOptions.slice(0, 3)) {
      const savings = option.savingsVsPointToPointJpy
      const savingsTag = savings > 0 ? `saves ${formatJpy(savings)}` : savings < 0 ? `costs ${formatJpy(-savings)} more` : 'baseline'
      const timeTag = option.addedTravelTimeMinutes > 0 ? `, +${option.addedTravelTimeMinutes}min` : ''
      console.log(`  ${option.label.padEnd(40)} ${formatJpy(option.totalJpy).padStart(12)}  (${savingsTag} vs point-to-point${timeTag})`)
      console.log(`    ${option.why}`)
    }
  }

  const guidance = computeGuidance(config, priceData, result)
  if (guidance.length > 0) {
    console.log(`\nGuidance (§5.2):`)
    for (const note of guidance) {
      const marker = note.severity === 'warning' ? '⚠' : '·'
      console.log(`  ${marker} ${note.message}`)
    }
  }
}

main()
