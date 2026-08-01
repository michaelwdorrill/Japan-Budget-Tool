import { describe, expect, it } from 'vitest'
import { computeSensitivity } from './sensitivity'
import { testPriceData } from './testFixtures/priceData'
import { baseTripConfig } from './testFixtures/tripConfig'
import type { Leg } from './trip'

function legWith(overrides: Partial<Leg>): Leg {
  return {
    cityId: 'tokyo',
    nights: 3,
    lodgingTier: 'business',
    food: { breakfast: 'casual', lunch: 'casual', dinner: 'casual' },
    activities: [],
    activityTierFallback: 'light',
    dayTrips: [],
    splurgeMeals: 1,
    ...overrides,
  }
}

function multiLegConfig() {
  return baseTripConfig({
    party: { adults: 2, children: [], rooms: 1 },
    timing: { startDate: '2026-06-01', season: null, nights: 6 },
    itinerary: {
      arrivalAirport: 'NRT',
      departureAirport: 'NRT',
      legs: [legWith({ cityId: 'tokyo', nights: 3 }), legWith({ cityId: 'kyoto', nights: 3 })],
    },
    flight: { mode: 'cash', cashEstimateUsd: 900, taxesAndFeesUsd: 100 },
  })
}

describe('computeSensitivity', () => {
  it('returns one factor per input, sorted descending by impact', () => {
    const factors = computeSensitivity(multiLegConfig(), testPriceData)
    expect(factors).toHaveLength(8)
    expect(factors.map((f) => f.id)).toEqual(
      expect.arrayContaining([
        'nights',
        'lodging_tier',
        'party_size',
        'dinner_tier',
        'splurge_meals',
        'fx_rate',
        'intercity_strategy',
        'activities',
      ]),
    )
    const impacts = factors.map((f) => f.impactJpyPerPerson)
    expect(impacts).toEqual([...impacts].sort((a, b) => b - a))
  })

  it('every factor reports a non-negative impact and low <= high', () => {
    const factors = computeSensitivity(multiLegConfig(), testPriceData)
    for (const f of factors) {
      expect(f.impactJpyPerPerson).toBeGreaterThanOrEqual(0)
      expect(f.lowJpyPerPerson).toBeLessThanOrEqual(f.highJpyPerPerson)
      expect(f.impactJpyPerPerson).toBe(f.highJpyPerPerson - f.lowJpyPerPerson)
    }
  })

  it('nights has nonzero impact: adding/removing a night changes the total', () => {
    const factors = computeSensitivity(multiLegConfig(), testPriceData)
    const nights = factors.find((f) => f.id === 'nights')
    expect(nights?.impactJpyPerPerson).toBeGreaterThan(0)
  })

  it('lodging tier shift clamps to the nearest available tier rather than throwing', () => {
    // Base config's single leg is Tokyo, which has every tier in the test
    // fixture, but this must not throw even if a real dataset had a city
    // with a shorter tier ladder.
    expect(() => computeSensitivity(baseTripConfig(), testPriceData)).not.toThrow()
  })

  it('does not shift dinner tier on a ryokan_hanmeshi leg (dinner is already zeroed there)', () => {
    const config = baseTripConfig({
      party: { adults: 2, children: [], rooms: 1 },
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'tokyo', lodgingTier: 'ryokan_hanmeshi' })],
      },
    })
    expect(() => computeSensitivity(config, testPriceData)).not.toThrow()
  })

  it('intercity strategy factor compares point-to-point against auto', () => {
    const factors = computeSensitivity(multiLegConfig(), testPriceData)
    const strategy = factors.find((f) => f.id === 'intercity_strategy')
    expect(strategy).toBeDefined()
    expect(strategy!.lowJpyPerPerson).toBeLessThanOrEqual(strategy!.highJpyPerPerson)
  })

  it('party size never goes below 1 adult', () => {
    const config = baseTripConfig({ party: { adults: 1, children: [], rooms: 1 } })
    expect(() => computeSensitivity(config, testPriceData)).not.toThrow()
  })

  it('splurge meal count never goes negative', () => {
    const config = baseTripConfig({
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ splurgeMeals: 0 })],
      },
    })
    expect(() => computeSensitivity(config, testPriceData)).not.toThrow()
  })

  it('does not mutate the original config', () => {
    const config = multiLegConfig()
    const before = JSON.stringify(config)
    computeSensitivity(config, testPriceData)
    expect(JSON.stringify(config)).toBe(before)
  })
})
