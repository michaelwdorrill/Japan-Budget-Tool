import { describe, expect, it } from 'vitest'
import { computeLocalTransport } from './localTransport'
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

describe('computeLocalTransport', () => {
  it('multiplies the city daily rate by people and nights', () => {
    const config = baseTripConfig({
      party: { adults: 2, children: [], rooms: 1 },
      itinerary: { arrivalAirport: 'NRT', departureAirport: 'NRT', legs: [legWith({ nights: 3 })] },
    })
    const result = computeLocalTransport(config, testPriceData)
    expect(result.totalJpy).toBe(1000 * 2 * 3)
  })

  it('sums across multiple legs with different cities', () => {
    const config = baseTripConfig({
      party: { adults: 1, children: [], rooms: 1 },
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'tokyo', nights: 2 }), legWith({ cityId: 'kyoto', nights: 3 })],
      },
    })
    const result = computeLocalTransport(config, testPriceData)
    expect(result.totalJpy).toBe(1000 * 1 * 2 + 900 * 1 * 3)
  })

  it('throws a clear error when a city has no local transit price', () => {
    const config = baseTripConfig({
      itinerary: { arrivalAirport: 'NRT', departureAirport: 'NRT', legs: [legWith({ cityId: 'osaka' })] },
    })
    expect(() => computeLocalTransport(config, testPriceData)).toThrow(/no price record/)
  })
})
