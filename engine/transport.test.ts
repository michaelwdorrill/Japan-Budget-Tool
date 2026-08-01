import { describe, expect, it } from 'vitest'
import { computeTransport } from './transport'
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

describe('computeTransport', () => {
  it('sums point-to-point reserved fares between consecutive legs, weighted by fare-equivalent people', () => {
    const config = baseTripConfig({
      party: { adults: 2, children: [], rooms: 1 },
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'tokyo' }), legWith({ cityId: 'kyoto' })],
      },
      transport: { strategy: 'point_to_point', railClass: 'ordinary', luggageForwarding: false },
    })
    const result = computeTransport(config, testPriceData)
    expect(result.totalJpy).toBe(14000 * 2)
  })

  it('uses the green car fare when railClass is green', () => {
    const config = baseTripConfig({
      party: { adults: 1, children: [], rooms: 1 },
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'tokyo' }), legWith({ cityId: 'kyoto' })],
      },
      transport: { strategy: 'point_to_point', railClass: 'green', luggageForwarding: false },
    })
    const result = computeTransport(config, testPriceData)
    expect(result.totalJpy).toBe(19000)
  })

  it('skips a fare lookup for consecutive legs in the same city', () => {
    const config = baseTripConfig({
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'tokyo' }), legWith({ cityId: 'tokyo' })],
      },
    })
    const result = computeTransport(config, testPriceData)
    expect(result.lineItems).toHaveLength(0)
  })

  it('applies child fare fractions to point-to-point fares', () => {
    const config = baseTripConfig({
      party: { adults: 1, children: [{ age: 8 }], rooms: 1 },
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'tokyo' }), legWith({ cityId: 'kyoto' })],
      },
    })
    const result = computeTransport(config, testPriceData)
    // 1 adult (fraction 1) + 1 child age 8 (fraction 0.5) = 1.5 fare-equivalent people.
    expect(result.totalJpy).toBe(14000 * 1.5)
  })

  it('uses national pass pricing when transport.strategy names a pass id', () => {
    const config = baseTripConfig({
      party: { adults: 2, children: [{ age: 8 }, { age: 3 }], rooms: 1 },
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'tokyo' }), legWith({ cityId: 'kyoto' })],
      },
      transport: { strategy: 'jr_test_7day_ordinary', railClass: 'ordinary', luggageForwarding: false },
    })
    const result = computeTransport(config, testPriceData)
    // 2 adults + 1 child >=12 (none here) = 2 full fares @ ¥50,000; 1 child 6-11 @ 50% = ¥25,000;
    // child under 6 travels free and needs no pass.
    expect(result.totalJpy).toBe(50000 * 2 + 25000)
  })

  it('throws for an unrecognized explicit pass id', () => {
    const config = baseTripConfig({
      transport: { strategy: 'not_a_real_pass', railClass: 'ordinary', luggageForwarding: false },
    })
    expect(() => computeTransport(config, testPriceData)).toThrow(/unknown transport strategy\/pass id/)
  })

  it('adds luggage forwarding across transfers when enabled', () => {
    const config = baseTripConfig({
      party: { adults: 2, children: [], rooms: 1 },
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'tokyo' }), legWith({ cityId: 'kyoto' })],
      },
      transport: { strategy: 'point_to_point', railClass: 'ordinary', luggageForwarding: true },
    })
    const result = computeTransport(config, testPriceData)
    const luggageLine = result.lineItems.find((i) => i.subcategory === 'C6')
    expect(luggageLine?.amountJpy).toBe(2250 * 2 * 1) // 2 people, 1 transfer
  })

  it('omits luggage forwarding when disabled', () => {
    const config = baseTripConfig({
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'tokyo' }), legWith({ cityId: 'kyoto' })],
      },
      transport: { strategy: 'point_to_point', railClass: 'ordinary', luggageForwarding: false },
    })
    const result = computeTransport(config, testPriceData)
    expect(result.lineItems.some((i) => i.subcategory === 'C6')).toBe(false)
  })

  it('omits luggage forwarding for a single-leg trip even when enabled', () => {
    const config = baseTripConfig({
      transport: { strategy: 'point_to_point', railClass: 'ordinary', luggageForwarding: true },
    })
    const result = computeTransport(config, testPriceData)
    expect(result.lineItems.some((i) => i.subcategory === 'C6')).toBe(false)
  })

  it('throws a clear error when no fare exists for a city pair', () => {
    const config = baseTripConfig({
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'tokyo' }), legWith({ cityId: 'osaka' })],
      },
    })
    expect(() => computeTransport(config, testPriceData)).toThrow(/no rail fare/)
  })

  it('resolves a bidirectional fare in reverse order', () => {
    const config = baseTripConfig({
      party: { adults: 1, children: [], rooms: 1 },
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'kyoto' }), legWith({ cityId: 'tokyo' })],
      },
    })
    const result = computeTransport(config, testPriceData)
    expect(result.totalJpy).toBe(14000)
  })

  it('falls back to the reserved fare for green class when no green car fare is priced', () => {
    const config = baseTripConfig({
      party: { adults: 1, children: [], rooms: 1 },
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'kyoto' }), legWith({ cityId: 'osaka' })],
      },
      transport: { strategy: 'point_to_point', railClass: 'green', luggageForwarding: false },
    })
    const result = computeTransport(config, testPriceData)
    expect(result.totalJpy).toBe(580)
  })

  it('"auto" picks the cheapest option from the optimizer, not necessarily a pass', () => {
    const config = baseTripConfig({
      party: { adults: 1, children: [], rooms: 1 },
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'tokyo' }), legWith({ cityId: 'kyoto' })],
      },
      transport: { strategy: 'auto', railClass: 'ordinary', luggageForwarding: false },
    })
    const result = computeTransport(config, testPriceData)
    // A single short journey never beats a ¥50,000 pass; the fixture's discount
    // product (¥10,000) undercuts even the plain point-to-point fare (¥14,000).
    expect(result.totalJpy).toBe(10000)
    expect(result.options[0].id).toBe('discount_products')
  })

  it('exposes the full ranked option list from the optimizer', () => {
    const config = baseTripConfig({
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'tokyo' }), legWith({ cityId: 'kyoto' })],
      },
    })
    const result = computeTransport(config, testPriceData)
    expect(result.options.length).toBeGreaterThan(1)
    expect(result.options.map((o) => o.totalJpy)).toEqual([...result.options.map((o) => o.totalJpy)].sort((a, b) => a - b))
  })
})
