import { describe, expect, it } from 'vitest'
import { computeBudget } from '../engine/budget'
import { computeSensitivity } from '../engine/sensitivity'
import { computeCategorySegments, computeCityBreakdown, computeTornadoBars } from './charts'
import { testPriceData } from '../engine/testFixtures/priceData'
import { baseTripConfig } from '../engine/testFixtures/tripConfig'
import type { Leg } from '../engine/trip'

function legWith(overrides: Partial<Leg>): Leg {
  return {
    cityId: 'tokyo',
    nights: 2,
    lodgingTier: 'business',
    food: { breakfast: 'casual', lunch: 'casual', dinner: 'casual' },
    activities: [],
    activityTierFallback: 'light',
    dayTrips: [],
    splurgeMeals: 0,
    ...overrides,
  }
}

describe('computeCategorySegments', () => {
  it('divides each category total by headcount and sums to a share of 1 across categories with spend', () => {
    const config = baseTripConfig()
    const budget = computeBudget(config, testPriceData)
    const segments = computeCategorySegments(budget, 2)

    const totalPerPerson = segments.reduce((sum, s) => sum + s.amountJpyPerPerson, 0)
    expect(totalPerPerson).toBe(budget.totalJpyPerPerson)
    expect(segments.every((s) => s.amountJpyPerPerson > 0)).toBe(true)
    // Every segment gets its own color slot, no repeats.
    expect(new Set(segments.map((s) => s.colorVar)).size).toBe(segments.length)
  })

  it('omits categories with zero spend', () => {
    // A single-leg trip has no city changes, so intercity_transport (no
    // fares, no luggage forwarding) lands at exactly zero.
    const config = baseTripConfig()
    const budget = computeBudget(config, testPriceData)
    expect(budget.totalsByCategory.intercity_transport).toBe(0)
    const segments = computeCategorySegments(budget, 2)
    expect(segments.find((s) => s.category === 'intercity_transport')).toBeUndefined()
  })
})

describe('computeCityBreakdown', () => {
  it('aggregates nights and cost per city across multiple legs, sorted by total spend descending', () => {
    const config = baseTripConfig({
      party: { adults: 2, children: [], rooms: 1 },
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'tokyo', nights: 2 }), legWith({ cityId: 'kyoto', nights: 1, lodgingTier: 'luxury' })],
      },
    })
    const budget = computeBudget(config, testPriceData)
    const rows = computeCityBreakdown(config, budget.lineItems)

    expect(rows.map((r) => r.cityId)).toEqual(['kyoto', 'tokyo'])
    const tokyoRow = rows.find((r) => r.cityId === 'tokyo')!
    expect(tokyoRow.nights).toBe(2)
    expect(tokyoRow.jpyPerNight).toBe(Math.round(tokyoRow.totalJpy / 2))
  })

  it('sums nights across two legs that revisit the same city', () => {
    const config = baseTripConfig({
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'tokyo', nights: 2 }), legWith({ cityId: 'kyoto', nights: 1 }), legWith({ cityId: 'tokyo', nights: 3 })],
      },
    })
    const budget = computeBudget(config, testPriceData)
    const rows = computeCityBreakdown(config, budget.lineItems)
    expect(rows.find((r) => r.cityId === 'tokyo')?.nights).toBe(5)
  })

  it('reports a zero-night waypoint leg at its raw total rather than dividing by zero', () => {
    const config = baseTripConfig({
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'tokyo', nights: 0 })],
      },
    })
    const budget = computeBudget(config, testPriceData)
    const rows = computeCityBreakdown(config, budget.lineItems)
    const row = rows.find((r) => r.cityId === 'tokyo')!
    expect(row.nights).toBe(0)
    expect(row.jpyPerNight).toBe(row.totalJpy)
  })
})

describe('computeTornadoBars', () => {
  it('scales every bar to the largest-impact factor and keeps the ordering', () => {
    const config = baseTripConfig({
      party: { adults: 2, children: [], rooms: 1 },
      timing: { startDate: '2026-06-01', season: null, nights: 3 },
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'tokyo', nights: 3 })],
      },
    })
    const factors = computeSensitivity(config, testPriceData)
    const bars = computeTornadoBars(factors)

    expect(bars.map((b) => b.id)).toEqual(factors.map((f) => f.id))
    const maxImpactId = factors.reduce((a, b) => (b.impactJpyPerPerson > a.impactJpyPerPerson ? b : a)).id
    const maxBar = bars.find((b) => b.id === maxImpactId)!
    expect(Math.max(maxBar.downFraction, maxBar.upFraction)).toBeCloseTo(1, 5)
    for (const bar of bars) {
      expect(bar.downFraction).toBeGreaterThanOrEqual(0)
      expect(bar.upFraction).toBeGreaterThanOrEqual(0)
      expect(bar.downFraction).toBeLessThanOrEqual(1)
      expect(bar.upFraction).toBeLessThanOrEqual(1)
    }
  })

  it('handles an empty factor list without throwing', () => {
    expect(computeTornadoBars([])).toEqual([])
  })
})
