import { describe, expect, it } from 'vitest'
import { computeFood } from './food'
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

describe('computeFood', () => {
  it('sums breakfast, lunch, and dinner across nights and people, plus drinks', () => {
    const config = baseTripConfig({
      party: { adults: 2, children: [], rooms: 1 },
      itinerary: { arrivalAirport: 'NRT', departureAirport: 'NRT', legs: [legWith({ nights: 2 })] },
    })
    const result = computeFood(config, testPriceData)
    // breakfast 1000 + lunch 1200 + dinner 3000 = 5200/person/day * 2 people * 2 days = 20800
    // drinks 1500/person/day * 2 people * 2 days = 6000
    expect(result.totalJpy).toBe(20800 + 6000)
  })

  it('zeroes breakfast and dinner for a ryokan_hanmeshi leg but keeps lunch', () => {
    const config = baseTripConfig({
      party: { adults: 2, children: [], rooms: 1 },
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ nights: 2, lodgingTier: 'ryokan_hanmeshi' })],
      },
    })
    const result = computeFood(config, testPriceData)
    expect(result.lineItems.some((i) => i.subcategory === 'E1')).toBe(false)
    expect(result.lineItems.some((i) => i.subcategory === 'E3')).toBe(false)
    expect(result.lineItems.some((i) => i.subcategory === 'E2')).toBe(true)
  })

  it('adds a splurge-meal line when splurgeMeals > 0', () => {
    const config = baseTripConfig({
      party: { adults: 2, children: [], rooms: 1 },
      itinerary: { arrivalAirport: 'NRT', departureAirport: 'NRT', legs: [legWith({ nights: 1, splurgeMeals: 1 })] },
    })
    const result = computeFood(config, testPriceData)
    const splurgeLine = result.lineItems.find((i) => i.subcategory === 'E4')
    expect(splurgeLine?.amountJpy).toBe(30000 * 2) // per_person_per_use * 2 people * 1 use
  })

  it('omits the splurge-meal line when splurgeMeals is 0', () => {
    const config = baseTripConfig({
      itinerary: { arrivalAirport: 'NRT', departureAirport: 'NRT', legs: [legWith({ splurgeMeals: 0 })] },
    })
    const result = computeFood(config, testPriceData)
    expect(result.lineItems.some((i) => i.subcategory === 'E4')).toBe(false)
  })

  it('throws a clear error for an unmodeled meal-slot/tier combination', () => {
    const config = baseTripConfig({
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ food: { breakfast: 'splurge', lunch: 'casual', dinner: 'casual' } })],
      },
    })
    expect(() => computeFood(config, testPriceData)).toThrow(/no price record/)
  })
})
