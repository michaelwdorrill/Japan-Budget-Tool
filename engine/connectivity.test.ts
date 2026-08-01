import { describe, expect, it } from 'vitest'
import { computeConnectivity } from './connectivity'
import { testPriceData } from './testFixtures/priceData'
import { baseTripConfig } from './testFixtures/tripConfig'
import type { Leg } from './trip'

function legWith(overrides: Partial<Leg>): Leg {
  return {
    cityId: 'tokyo',
    nights: 1,
    lodgingTier: 'business',
    food: { breakfast: 'casual', lunch: 'casual', dinner: 'casual' },
    activities: [],
    activityTierFallback: 'light',
    dayTrips: [],
    splurgeMeals: 0,
    ...overrides,
  }
}

describe('computeConnectivity', () => {
  it('picks the 7-day eSIM for trips of 7 nights or fewer', () => {
    const config = baseTripConfig({
      party: { adults: 2, children: [], rooms: 1 },
      itinerary: { arrivalAirport: 'NRT', departureAirport: 'NRT', legs: [legWith({ nights: 5 })] },
    })
    const result = computeConnectivity(config, testPriceData)
    expect(result.lineItems.some((i) => i.id === 'connectivity-esim_7day')).toBe(true)
    expect(result.lineItems.some((i) => i.subcategory === 'G2' && i.label === 'Laundry')).toBe(false)
  })

  it('picks the 14-day eSIM and adds laundry for trips past the 10-night threshold', () => {
    const config = baseTripConfig({
      party: { adults: 2, children: [], rooms: 1 },
      itinerary: { arrivalAirport: 'NRT', departureAirport: 'NRT', legs: [legWith({ nights: 12 })] },
    })
    const result = computeConnectivity(config, testPriceData)
    expect(result.lineItems.some((i) => i.id === 'connectivity-esim_14day')).toBe(true)
    expect(result.lineItems.some((i) => i.id === 'connectivity-laundry')).toBe(true)
  })

  it('always includes coin lockers', () => {
    const config = baseTripConfig()
    const result = computeConnectivity(config, testPriceData)
    expect(result.lineItems.some((i) => i.id === 'connectivity-coin-lockers')).toBe(true)
  })
})
