import { describe, expect, it } from 'vitest'
import { computeActivities } from './activities'
import { testPriceData } from './testFixtures/priceData'
import { baseTripConfig } from './testFixtures/tripConfig'
import type { Leg } from './trip'

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

describe('computeActivities', () => {
  it('applies the fallback tier rate across every night of the leg', () => {
    const config = baseTripConfig({
      party: { adults: 2, children: [], rooms: 1 },
      itinerary: { arrivalAirport: 'NRT', departureAirport: 'NRT', legs: [legWith({ nights: 3, activityTierFallback: 'standard' })] },
    })
    const result = computeActivities(config, testPriceData)
    expect(result.totalJpy).toBe(3500 * 2 * 3)
  })

  it('adds named activity selections on top of the fallback', () => {
    const config = baseTripConfig({
      party: { adults: 2, children: [], rooms: 1 },
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ nights: 1, activityTierFallback: 'light', activities: [{ activityId: 'test_activity_tokyo', quantity: 2 }] })],
      },
    })
    const result = computeActivities(config, testPriceData)
    const fallback = 1500 * 2 * 1
    const named = 4000 * 2 * 2 // per_person_per_use * people * quantity
    expect(result.totalJpy).toBe(fallback + named)
  })

  it('throws a clear error for an unknown named activity id', () => {
    const config = baseTripConfig({
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ activities: [{ activityId: 'not_a_real_activity', quantity: 1 }] })],
      },
    })
    expect(() => computeActivities(config, testPriceData)).toThrow(/named activity/)
  })
})
