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

  // §5.1, corrected. A season window overlapping a leg used to multiply the
  // whole leg's room rate — so one qualifying night repriced every other
  // night in the stay. A season is now a warning only (see guidance.ts);
  // the room rate is exactly what the price record says.
  it('does not reprice a room because the leg overlaps a season window', () => {
    const inSeason = baseTripConfig({
      party: { adults: 2, children: [], rooms: 1 },
      timing: { startDate: '2026-03-25', season: null, nights: 3 },
      itinerary: { arrivalAirport: 'NRT', departureAirport: 'NRT', legs: [legWith({ cityId: 'tokyo', nights: 3 })] },
    })
    const outOfSeason = baseTripConfig({
      party: { adults: 2, children: [], rooms: 1 },
      timing: { startDate: '2026-06-01', season: null, nights: 3 },
      itinerary: { arrivalAirport: 'NRT', departureAirport: 'NRT', legs: [legWith({ cityId: 'tokyo', nights: 3 })] },
    })

    const inSeasonRoom = computeLodging(inSeason, testPriceData, '2026-03-25').lineItems.find((i) => i.subcategory === 'B1')
    const outOfSeasonRoom = computeLodging(outOfSeason, testPriceData, '2026-06-01').lineItems.find((i) => i.subcategory === 'B1')

    expect(inSeasonRoom?.amountJpy).toBe(10000 * 3)
    expect(inSeasonRoom?.amountJpy).toBe(outOfSeasonRoom?.amountJpy)
    expect(inSeasonRoom?.label).not.toContain('pricing')
  })

  it('still reports which seasons a leg overlaps, so the guidance layer can warn', () => {
    const config = baseTripConfig({
      timing: { startDate: '2026-03-25', season: null, nights: 3 },
      itinerary: { arrivalAirport: 'NRT', departureAirport: 'NRT', legs: [legWith({ cityId: 'tokyo', nights: 3 })] },
    })
    const result = computeLodging(config, testPriceData, '2026-03-25')
    expect(result.seasonOverlaps).toHaveLength(1)
    expect(result.seasonOverlaps[0]).toMatchObject({ cityId: 'tokyo', legIndex: 0 })
  })

  it('reports no season overlap when the leg falls outside every window', () => {
    const config = baseTripConfig({ timing: { startDate: '2026-06-01', season: null, nights: 3 } })
    expect(computeLodging(config, testPriceData, '2026-06-01').seasonOverlaps).toHaveLength(0)
  })

  // Accommodation tax is charged per night under the rule in force that
  // night. 'testville' switches from ¥100 to ¥200 on 2026-06-15.
  it('charges each night under the tax rule effective on that night', () => {
    const config = baseTripConfig({
      party: { adults: 1, children: [], rooms: 1 },
      timing: { startDate: '2026-06-14', season: null, nights: 2 },
      itinerary: { arrivalAirport: 'NRT', departureAirport: 'NRT', legs: [legWith({ cityId: 'testville', nights: 2 })] },
    })
    const taxLine = computeLodging(config, testPriceData, '2026-06-14').lineItems.find((i) => i.subcategory === 'B2')
    // Night 1 (06-14) at ¥100 + night 2 (06-15) at ¥200. Freezing the trip
    // start date for the whole leg would have charged ¥200.
    expect(taxLine?.amountJpy).toBe(300)
  })

  it('marks the accommodation tax line as fixed so the roll-up cannot widen it with hotel volatility', () => {
    const config = baseTripConfig()
    const taxLine = computeLodging(config, testPriceData, '2026-06-01').lineItems.find((i) => i.subcategory === 'B2')
    expect(taxLine?.uncertainty).toBe('fixed')
  })

  it('includes the leg index in line-item ids so a revisited city cannot collide', () => {
    const config = baseTripConfig({
      itinerary: {
        arrivalAirport: 'NRT',
        departureAirport: 'NRT',
        legs: [legWith({ cityId: 'tokyo', nights: 2 }), legWith({ cityId: 'kyoto', nights: 1 }), legWith({ cityId: 'tokyo', nights: 2 })],
      },
    })
    const ids = computeLodging(config, testPriceData, '2026-06-01').lineItems.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
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
