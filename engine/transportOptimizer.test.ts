import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { findTransportOption, optimizeTransport } from './transportOptimizer'
import { loadPriceData } from './loadPriceData'
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

describe('optimizeTransport (unit, small fixture)', () => {
  it('ranks options ascending by total cost and picks the cheapest as [0]', () => {
    const config = baseTripConfig({
      party: { adults: 1, children: [], rooms: 1 },
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'tokyo' }), legWith({ cityId: 'kyoto' })],
      },
    })
    const { options } = optimizeTransport(config, testPriceData)

    const totals = options.map((o) => o.totalJpy)
    expect(totals).toEqual([...totals].sort((a, b) => a - b))

    // Discount product (Kodama, ¥10,000) beats point-to-point (¥14,000) beats
    // both national pass tiers (¥20,000 and ¥50,000) for a single short journey.
    expect(options[0].id).toBe('discount_products')
    // The cheapest matching product (¥6,500 bus), not the first in the data.
    expect(options[0].totalJpy).toBe(6500)
    expect(options.find((o) => o.id === 'point_to_point')?.totalJpy).toBe(14000)
    expect(options.find((o) => o.id === 'jr_test_3day_ordinary')?.totalJpy).toBe(20000)
    expect(options.find((o) => o.id === 'jr_test_7day_ordinary')?.totalJpy).toBe(50000)
  })

  it('excludes a regional pass whose coverage does not touch any journey in the itinerary', () => {
    const config = baseTripConfig({
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'tokyo' }), legWith({ cityId: 'kyoto' })],
      },
    })
    const { options } = optimizeTransport(config, testPriceData)
    expect(options.some((o) => o.id === 'test_regional_kansai')).toBe(false)
  })

  it('includes a regional pass and only substitutes eligible journeys', () => {
    const config = baseTripConfig({
      party: { adults: 1, children: [], rooms: 1 },
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'tokyo' }), legWith({ cityId: 'kyoto' }), legWith({ cityId: 'osaka' })],
      },
    })
    const { options } = optimizeTransport(config, testPriceData)
    const regional = options.find((o) => o.id === 'test_regional_kansai')
    expect(regional).toBeDefined()
    // Only kyoto->osaka (¥580) is eligible; tokyo->kyoto (¥14,000) is always paid point-to-point.
    expect(regional?.totalJpy).toBe(2000 + 14000)
  })

  it('applies the Hikari/Sakura time penalty only to captured Tokaido/Sanyo journeys', () => {
    const config = baseTripConfig({
      party: { adults: 1, children: [], rooms: 1 },
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'tokyo' }), legWith({ cityId: 'hiroshima' })],
      },
    })
    const pass = findTransportOption(config, testPriceData, 'jr_test_7day_ordinary')
    expect(pass.addedTravelTimeMinutes).toBe(25)
  })

  it('reports zero added travel time for a captured journey not on a Tokaido/Sanyo line', () => {
    const config = baseTripConfig({
      party: { adults: 1, children: [], rooms: 1 },
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'tokyo' }), legWith({ cityId: 'kyoto' })],
      },
    })
    const pass = findTransportOption(config, testPriceData, 'jr_test_7day_ordinary')
    expect(pass.addedTravelTimeMinutes).toBe(0)
  })

  it('substitutes multiple journeys with different discount products in one itinerary', () => {
    const config = baseTripConfig({
      party: { adults: 1, children: [], rooms: 1 },
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'tokyo' }), legWith({ cityId: 'kyoto' }), legWith({ cityId: 'osaka' })],
      },
    })
    const discount = findTransportOption(config, testPriceData, 'discount_products')
    // Cheapest per journey: ¥6,500 bus for tokyo->kyoto (beating the
    // ¥10,000 Kodama) + ¥300 bus for kyoto->osaka.
    expect(discount.totalJpy).toBe(6800)
    // Both substitutions are buses now, so both carry the bus time penalty.
    expect(discount.addedTravelTimeMinutes).toBe(300 + 300)
  })

  it('slides the pass window to capture the highest-value cluster of journeys', () => {
    // 3 journeys spaced so a 3-day pass can only ever cover 2 of them at once
    // (tokyo->kyoto on day 2, kyoto->osaka on day 4, then a long gap before
    // osaka->kyoto on day 10) — the optimizer should choose the window over
    // the two adjacent, cheaper-to-skip journeys correctly rather than a
    // window that captures only the single most expensive one.
    const config = baseTripConfig({
      party: { adults: 1, children: [], rooms: 1 },
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [
          legWith({ cityId: 'tokyo', nights: 2 }),
          legWith({ cityId: 'kyoto', nights: 2 }),
          legWith({ cityId: 'osaka', nights: 6 }),
          legWith({ cityId: 'kyoto', nights: 1 }),
        ],
      },
    })
    const pass = findTransportOption(config, testPriceData, 'jr_test_3day_ordinary')
    // Journeys: tokyo->kyoto (day2, ¥14,000), kyoto->osaka (day4, ¥580), osaka->kyoto (day10, ¥580).
    // A 3-day window from day2 captures both the day2 and day4 journeys (¥14,580);
    // a window anchored at day10 only captures ¥580. The optimizer must find the former.
    expect(pass.totalJpy).toBe(20000 + 580) // pass + the one uncaptured osaka->kyoto leg
  })

  it('returns just the point-to-point option (with 0 journeys) for a single-leg trip', () => {
    const config = baseTripConfig()
    const { options } = optimizeTransport(config, testPriceData)
    expect(options).toHaveLength(1)
    expect(options[0].id).toBe('point_to_point')
    expect(options[0].totalJpy).toBe(0)
    expect(options[0].lineItems).toHaveLength(0)
  })

  it('reports zero savings and a descriptive "why" for the point-to-point baseline', () => {
    const config = baseTripConfig({
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'tokyo' }), legWith({ cityId: 'kyoto' })],
      },
    })
    const p2p = findTransportOption(config, testPriceData, 'point_to_point')
    expect(p2p.savingsVsPointToPointJpy).toBe(0)
    expect(p2p.why.length).toBeGreaterThan(0)
  })

  it('describes a pass that captures nothing when its window cannot reach any journey', () => {
    // A 3-day pass cannot span a trip whose two journeys are 20 nights apart.
    const config = baseTripConfig({
      party: { adults: 1, children: [], rooms: 1 },
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'tokyo', nights: 1 }), legWith({ cityId: 'kyoto', nights: 20 }), legWith({ cityId: 'osaka', nights: 1 })],
      },
    })
    const pass = findTransportOption(config, testPriceData, 'jr_test_3day_ordinary')
    // A 3-day window can cover at most one of the two journeys (day1 and day21 are 20 apart),
    // so the pass "captures" the better single journey (¥14,000) rather than nothing.
    expect(pass.why).toMatch(/Captures/)
  })

  it('throws for an unrecognized option id', () => {
    const config = baseTripConfig()
    expect(() => findTransportOption(config, testPriceData, 'not_a_real_option')).toThrow(/unknown transport strategy\/pass id/)
  })
})

describe('optimizeTransport known-answer gate (§9 Phase 4, real seed data)', () => {
  const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
  const priceData = loadPriceData(path.join(rootDir, 'data'))

  it('rejects the national pass for a Tokyo/Kyoto/Osaka 7-night trip', () => {
    const config = baseTripConfig({
      party: { adults: 2, children: [], rooms: 1 },
      timing: { startDate: '2026-06-01', season: null, nights: 7 },
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'KIX',
        legs: [
          legWith({ cityId: 'tokyo', nights: 3 }),
          legWith({ cityId: 'kyoto', nights: 2 }),
          legWith({ cityId: 'osaka', nights: 2 }),
        ],
      },
      transport: { strategy: 'auto', railClass: 'ordinary', luggageForwarding: false },
    })
    const { options } = optimizeTransport(config, priceData)
    // The cheapest option must not be a national pass — point-to-point (or an
    // even cheaper discount-product substitution) correctly beats it.
    expect(options[0].id.startsWith('jr_national')).toBe(false)
    expect(options.find((o) => o.id.startsWith('jr_national'))?.totalJpy).toBeGreaterThan(options[0].totalJpy)
  })

  it('accepts the national pass for a Tokyo/Hiroshima/Kanazawa/Tokyo trip', () => {
    const config = baseTripConfig({
      party: { adults: 2, children: [], rooms: 1 },
      timing: { startDate: '2026-06-01', season: null, nights: 6 },
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [
          legWith({ cityId: 'tokyo', nights: 2 }),
          legWith({ cityId: 'hiroshima', nights: 2 }),
          legWith({ cityId: 'kanazawa', nights: 2 }),
          legWith({ cityId: 'tokyo', nights: 0 }),
        ],
      },
      transport: { strategy: 'auto', railClass: 'ordinary', luggageForwarding: false },
    })
    const { options } = optimizeTransport(config, priceData)
    const chosenId = options[0].id
    expect(chosenId).toBe('jr_national_7day_ordinary')
    expect(options[0].totalJpy).toBeLessThan(options.find((o) => o.id === 'point_to_point')!.totalJpy)
  })
})

// Coverage and validity integrity — the defects that let the optimizer
// recommend an option cheaper than anything actually purchasable.
describe('pass coverage and product validity', () => {
  function tripConfig(legs: Array<{ cityId: string; nights: number }>, over: Record<string, unknown> = {}) {
    return baseTripConfig({
      party: { adults: 1, children: [], rooms: 1 },
      timing: { startDate: '2026-09-01', season: null, nights: legs.reduce((s, l) => s + l.nights, 0) },
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: legs.map((l) => legWith({ cityId: l.cityId, nights: l.nights })),
      },
      transport: { strategy: 'auto', railClass: 'ordinary', luggageForwarding: false },
      ...over,
    })
  }

  it('leaves a private-rail fare in the paid remainder of a JR pass option', () => {
    const config = tripConfig([{ cityId: 'tokyo', nights: 2 }, { cityId: 'hakone', nights: 2 }])
    const pass = optimizeTransport(config, testPriceData).options.find((o) => o.id === 'jr_test_7day_ordinary')!
    // ¥50,000 pass + the ¥2,470 private fare it cannot cover. Treating every
    // edge as pass-eligible made this option look ¥2,470 cheaper than it is.
    expect(pass.totalJpy).toBe(50000 + 2470)
  })

  it('does not offer an ordinary regional pass for a Green-class request', () => {
    const green = tripConfig([{ cityId: 'kyoto', nights: 2 }, { cityId: 'osaka', nights: 2 }], {
      transport: { strategy: 'auto', railClass: 'green', luggageForwarding: false },
    })
    expect(optimizeTransport(green, testPriceData).options.map((o) => o.id)).not.toContain('test_regional_kansai')
  })

  it('does not rank a product whose sales ended before the travel date', () => {
    const config = tripConfig([{ cityId: 'tokyo', nights: 2 }, { cityId: 'kyoto', nights: 2 }])
    expect(optimizeTransport(config, testPriceData).options.map((o) => o.id)).not.toContain('test_regional_withdrawn')
  })

  it('still ranks that product for travel dated before its sales end', () => {
    const config = tripConfig([{ cityId: 'tokyo', nights: 2 }, { cityId: 'kyoto', nights: 2 }], {
      timing: { startDate: '2026-02-01', season: null, nights: 4 },
    })
    expect(optimizeTransport(config, testPriceData).options.map((o) => o.id)).toContain('test_regional_withdrawn')
  })

  it('substitutes the cheapest matching discount product, not the first in the data', () => {
    const config = tripConfig([{ cityId: 'tokyo', nights: 2 }, { cityId: 'kyoto', nights: 2 }])
    const discount = optimizeTransport(config, testPriceData).options.find((o) => o.id.includes('discount'))!
    // The ¥6,500 bus beats the ¥10,000 Kodama that appears first in the fixture.
    expect(discount.totalJpy).toBe(6500)
  })
})
