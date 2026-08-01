import type { TripConfig } from './trip'
import type { Category } from './price'
import type { PriceData } from './priceData'
import type { LineItem } from './lineItem'
import { resolveReferenceDate } from './dateUtils'
import { computeGettingThere } from './gettingThere'
import { computeLodging } from './lodging'
import { computeTransport } from './transport'
import { computeLocalTransport } from './localTransport'
import { computeFood } from './food'
import { computeActivities } from './activities'
import { computeConnectivity } from './connectivity'
import { computeShopping } from './shopping'
import type { BracketEdgeWarning } from './tax'
import type { TransportOption } from './transportOptimizer'
import type { SeasonRecord } from './priceData'

// Categories B-H per §3.1: the base that contingency (I1) is a percentage
// of. Category A (getting there) is excluded — those costs are booked once
// up front and are not the kind of variable day-to-day spend contingency is
// meant to buffer. Exported for the uncertainty roll-up (monteCarlo.ts),
// which needs the same fixed/variable split per line item.
export const VARIABLE_CATEGORIES: Category[] = [
  'lodging',
  'intercity_transport',
  'local_transport',
  'food',
  'activities',
  'connectivity',
  'shopping',
]

export interface BudgetResult {
  lineItems: LineItem[]
  totalsByCategory: Record<Category, number>
  fixedCostsJpy: number // category A
  variableCostsJpy: number // categories B-H
  contingencyJpy: number // I1
  totalJpyParty: number // A + (B..H) + I1
  totalJpyPerPerson: number
  pointsOpportunityCostUsd: number // §7: never added to totalJpyParty
  bracketEdgeWarnings: Array<{ cityId: string; warning: BracketEdgeWarning }>
  referenceDate: string
  transportOptions: TransportOption[] // §4.2 ranked list, ascending by cost; show the top three
  seasonOverlaps: Array<{ cityId: string; legIndex: number; season: SeasonRecord }> // §5.1
}

function emptyCategoryTotals(): Record<Category, number> {
  return {
    getting_there: 0,
    lodging: 0,
    intercity_transport: 0,
    local_transport: 0,
    food: 0,
    activities: 0,
    connectivity: 0,
    shopping: 0,
    reserves: 0,
  }
}

// Deterministic, expected-value-only budget (Phase 2). Uncertainty roll-up
// (PERT/Monte Carlo over low/expected/high) is Phase 6 (monteCarlo.ts);
// this always uses each PriceRecord's `expected` value.
export function computeBudget(config: TripConfig, priceData: PriceData, now: Date = new Date()): BudgetResult {
  const totalPeopleCount = config.party.adults + config.party.children.length
  const referenceDate = resolveReferenceDate(config, priceData.seasons, now)

  const gettingThere = computeGettingThere(config, priceData)
  const lodging = computeLodging(config, priceData, referenceDate)
  const transport = computeTransport(config, priceData)
  const localTransport = computeLocalTransport(config, priceData)
  const food = computeFood(config, priceData)
  const activities = computeActivities(config, priceData)
  const connectivity = computeConnectivity(config, priceData)
  const shopping = computeShopping(config, priceData)

  const lineItems: LineItem[] = [
    ...gettingThere.lineItems,
    ...lodging.lineItems,
    ...transport.lineItems,
    ...localTransport.lineItems,
    ...food.lineItems,
    ...activities.lineItems,
    ...connectivity.lineItems,
    ...shopping.lineItems,
  ]

  const totalsByCategory = emptyCategoryTotals()
  for (const item of lineItems) {
    totalsByCategory[item.category] += item.amountJpy
  }

  const fixedCostsJpy = totalsByCategory.getting_there
  const variableCostsJpy = VARIABLE_CATEGORIES.reduce((sum, category) => sum + totalsByCategory[category], 0)
  const contingencyJpy = Math.round(variableCostsJpy * (config.money.contingencyPct / 100))
  totalsByCategory.reserves = contingencyJpy

  const totalJpyParty = fixedCostsJpy + variableCostsJpy + contingencyJpy
  const totalJpyPerPerson = totalPeopleCount > 0 ? Math.round(totalJpyParty / totalPeopleCount) : totalJpyParty

  return {
    lineItems,
    totalsByCategory,
    fixedCostsJpy,
    variableCostsJpy,
    contingencyJpy,
    totalJpyParty,
    totalJpyPerPerson,
    pointsOpportunityCostUsd: gettingThere.pointsOpportunityCostUsd,
    bracketEdgeWarnings: lodging.bracketEdgeWarnings,
    referenceDate,
    transportOptions: transport.options,
    seasonOverlaps: lodging.seasonOverlaps,
  }
}
