import type { TripConfig } from '../engine/trip'
import type { LineItem } from '../engine/lineItem'
import type { Category } from '../engine/price'
import type { BudgetResult } from '../engine/budget'
import type { SensitivityFactor } from '../engine/sensitivity'

// §6 outputs: pure, DOM-free data-shaping for the chart components. Kept
// separate from rendering so the geometry/aggregation logic is testable
// without a browser.

// --- Stacked bar by category, per person -----------------------------

export interface CategorySegment {
  category: Category
  label: string
  amountJpyPerPerson: number
  pct: number // share of the stack, 0-1
  colorVar: string // CSS custom property name, e.g. "--series-1"
}

const SPENDING_CATEGORY_ORDER: Category[] = [
  'getting_there',
  'lodging',
  'intercity_transport',
  'local_transport',
  'food',
  'activities',
  'connectivity',
  'shopping',
]

const CATEGORY_LABELS: Record<Category, string> = {
  getting_there: 'Getting there',
  lodging: 'Lodging',
  intercity_transport: 'Intercity transport',
  local_transport: 'Local transport',
  food: 'Food',
  activities: 'Activities',
  connectivity: 'Connectivity',
  shopping: 'Shopping',
  reserves: 'Contingency (buffer)',
}

// Slots 1-8 of the validated categorical palette (dataviz skill), one per
// spending category. Contingency isn't a spending category — it's a
// buffer — so it gets a neutral gray instead of a 9th categorical hue.
const CATEGORY_COLOR_VARS: Record<Category, string> = {
  getting_there: '--series-1',
  lodging: '--series-2',
  intercity_transport: '--series-3',
  local_transport: '--series-4',
  food: '--series-5',
  activities: '--series-6',
  connectivity: '--series-7',
  shopping: '--series-8',
  reserves: '--series-buffer',
}

export function computeCategorySegments(budget: BudgetResult, totalPeopleCount: number): CategorySegment[] {
  const people = totalPeopleCount > 0 ? totalPeopleCount : 1
  const total = budget.totalJpyParty > 0 ? budget.totalJpyParty : 1
  const categories: Category[] = [...SPENDING_CATEGORY_ORDER, 'reserves']

  return categories
    .map((category) => {
      const amountJpy = budget.totalsByCategory[category]
      return {
        category,
        label: CATEGORY_LABELS[category],
        amountJpyPerPerson: Math.round(amountJpy / people),
        pct: amountJpy / total,
        colorVar: CATEGORY_COLOR_VARS[category],
      }
    })
    .filter((segment) => segment.amountJpyPerPerson > 0)
}

// --- Table by city -----------------------------------------------------

export interface CityBreakdownRow {
  cityId: string
  nights: number
  totalJpy: number
  jpyPerNight: number
}

export function computeCityBreakdown(config: TripConfig, lineItems: LineItem[]): CityBreakdownRow[] {
  const nightsByCity = new Map<string, number>()
  for (const leg of config.itinerary.legs) {
    nightsByCity.set(leg.cityId, (nightsByCity.get(leg.cityId) ?? 0) + leg.nights)
  }

  const totalByCity = new Map<string, number>()
  for (const item of lineItems) {
    if (!item.cityId) continue
    totalByCity.set(item.cityId, (totalByCity.get(item.cityId) ?? 0) + item.amountJpy)
  }

  const cityIds = new Set<string>([...nightsByCity.keys(), ...totalByCity.keys()])

  return Array.from(cityIds)
    .map((cityId) => {
      const nights = nightsByCity.get(cityId) ?? 0
      const totalJpy = totalByCity.get(cityId) ?? 0
      return { cityId, nights, totalJpy, jpyPerNight: nights > 0 ? Math.round(totalJpy / nights) : totalJpy }
    })
    .sort((a, b) => b.totalJpy - a.totalJpy)
}

// --- Tornado chart (sensitivity) ---------------------------------------

export interface TornadoBar extends SensitivityFactor {
  // Fraction of the chart's half-width (0-1) each direction extends,
  // relative to whichever factor has the largest impact.
  downFraction: number
  upFraction: number
}

export function computeTornadoBars(factors: SensitivityFactor[]): TornadoBar[] {
  const maxImpact = Math.max(1, ...factors.map((f) => f.impactJpyPerPerson))
  return factors.map((factor) => {
    const down = factor.baselineJpyPerPerson - factor.lowJpyPerPerson
    const up = factor.highJpyPerPerson - factor.baselineJpyPerPerson
    return {
      ...factor,
      downFraction: Math.max(0, down) / maxImpact,
      upFraction: Math.max(0, up) / maxImpact,
    }
  })
}
