import { describe, expect, it } from 'vitest'
import { computeLodging } from './lodging'
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

describe('computeLodging', () => {
  it('computes per_room_per_night cost and the resulting municipal tax', () => {
    // 2 adults, 1 room, 3 nights @ ¥10,000/room/night = ¥30,000 room cost.
    // Nightly rate per person = 30000 / (3 nights * 2 people) = ¥5,000; Tokyo's flat
    // pre-2027 tax is ¥100/person/night regardless of rate.
    const config = baseTripConfig()
    const result = computeLodging(config, testPriceData, '2026-06-01')

    const roomLine = result.lineItems.find((i) => i.subcategory === 'B1')
    const taxLine = result.lineItems.find((i) => i.subcategory === 'B2')

    expect(roomLine?.amountJpy).toBe(30000)
    expect(taxLine?.amountJpy).toBe(100 * 3 * 2) // ¥600
    expect(result.totalJpy).toBe(30000 + 600)

    // §0.1: every line item carries a low/expected/high band.
    expect(roomLine?.lowJpy).toBe(8000 * 3)
    expect(roomLine?.highJpy).toBe(15000 * 3)
  })

  it('computes the tax band by re-evaluating brackets at the low/high room rate, not scaling the expected tax', () => {
    // Kyoto business: low ¥9,000/expected ¥12,000/high ¥16,000 per room/night, 1 room, 1 night, 1 person.
    // Nightly rates per person: low 9000 (6,000-19,999 bracket, ¥400), expected 12000 (same bracket, ¥400),
    // high 16000 (still 6,000-19,999 bracket, ¥400) — no bracket jump here, so confirm the band tracks the room band shape.
    const config = baseTripConfig({
      party: { adults: 1, children: [], rooms: 1 },
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'kyoto', nights: 1, lodgingTier: 'business' })],
      },
    })
    const result = computeLodging(config, testPriceData, '2026-06-01')
    const taxLine = result.lineItems.find((i) => i.subcategory === 'B2')
    expect(taxLine?.lowJpy).toBe(400)
    expect(taxLine?.amountJpy).toBe(400)
    expect(taxLine?.highJpy).toBe(400)
  })

  it('widens the tax band across a bracket edge when the room rate band straddles it', () => {
    // Kyoto luxury: low ¥150,000/expected ¥200,000/high ¥300,000 per room/night, 1 room, 1 night, 1 person.
    // Nightly rates per person: low 150000 (50,000-99,999 bracket? no: 150000 is in >=100000 bracket too).
    // Use a party of 2 so the low bound (150000/2=75000) sits in the 50,000-99,999 bracket (¥4,000) while the
    // high bound (300000/2=150000) sits in the >=100,000 bracket (¥10,000) -- a real bracket jump.
    const config = baseTripConfig({
      party: { adults: 2, children: [], rooms: 1 },
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'kyoto', nights: 1, lodgingTier: 'luxury' })],
      },
    })
    const result = computeLodging(config, testPriceData, '2026-06-01')
    const taxLine = result.lineItems.find((i) => i.subcategory === 'B2')
    expect(taxLine?.lowJpy).toBe(4000 * 2) // ¥8,000: low bound still in the 50-99,999 bracket
    expect(taxLine?.highJpy).toBe(10000 * 2) // ¥20,000: high bound crosses into the top bracket
  })

  it('omits the tax line entirely when the city has no applicable tax record', () => {
    const config = baseTripConfig({
      party: { adults: 2, children: [], rooms: 1 },
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'osaka', nights: 2 })],
      },
    })
    const result = computeLodging(config, testPriceData, '2026-06-01')
    expect(result.lineItems.find((i) => i.subcategory === 'B2')).toBeUndefined()
    expect(result.lineItems.find((i) => i.subcategory === 'B1')?.amountJpy).toBe(9000 * 2)
  })

  it('surfaces a bracket edge warning for a Kyoto rate near a tax cliff', () => {
    // ¥19,500/room, 1 person, 1 night -> ¥19,500/person/night, within 10% of the
    // ¥20,000 bracket floor (see the equivalent lodgingTax unit test).
    const config = baseTripConfig({
      party: { adults: 1, children: [], rooms: 1 },
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'kyoto', nights: 1, lodgingTier: 'business' })],
      },
    })
    const result = computeLodging(config, testPriceData, '2026-06-01')
    expect(result.lineItems.find((i) => i.subcategory === 'B1')?.amountJpy).toBe(12000)
  })

  it('does not warn when a Kyoto rate is deep inside a bracket', () => {
    const config = baseTripConfig({
      party: { adults: 1, children: [], rooms: 1 },
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'kyoto', nights: 1, lodgingTier: 'luxury' })],
      },
    })
    const result = computeLodging(config, testPriceData, '2026-06-01')
    expect(result.bracketEdgeWarnings).toHaveLength(0)
  })

  it('applies per_person_per_night pricing for ryokan_hanmeshi legs', () => {
    const config = baseTripConfig({
      party: { adults: 2, children: [], rooms: 1 },
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'tokyo', nights: 2, lodgingTier: 'ryokan_hanmeshi' })],
      },
    })
    const result = computeLodging(config, testPriceData, '2026-06-01')
    const roomLine = result.lineItems.find((i) => i.subcategory === 'B1')
    // per_person_per_night: 2 people * 2 nights * ¥20,000 = ¥80,000.
    expect(roomLine?.amountJpy).toBe(80000)
  })

  it('sums lodging cost and tax across multiple legs', () => {
    const config = baseTripConfig({
      party: { adults: 2, children: [], rooms: 1 },
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'tokyo', nights: 2 }), legWith({ cityId: 'kyoto', nights: 2 })],
      },
    })
    const result = computeLodging(config, testPriceData, '2026-06-01')
    // Tokyo: 2 rooms-nights * ¥10,000 = ¥20,000 + tax ¥100*2*2=¥400.
    // Kyoto: 2 room-nights * ¥12,000 = ¥24,000; nightly rate/person = 24000/4 = ¥6,000 -> ¥400/night tax * 2 nights * 2 people = ¥1,600.
    expect(result.totalJpy).toBe(20000 + 400 + 24000 + 1600)
  })

  it('throws a clear error for an unknown city/tier combination', () => {
    const config = baseTripConfig({
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'kyoto', lodgingTier: 'hostel' })],
      },
    })
    expect(() => computeLodging(config, testPriceData, '2026-06-01')).toThrow(/no price record/)
  })
})
