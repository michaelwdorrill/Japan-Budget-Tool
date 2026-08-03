import { describe, expect, it } from 'vitest'
import { computeBudget } from './index'
import { testPriceData } from './testFixtures/priceData'
import { baseTripConfig } from './testFixtures/tripConfig'
import type { TripConfig } from './trip'

// Hand-computed end-to-end fixture (§9 Phase 2/3 gate: "hand-computed
// fixture matches to the yen"). See the accompanying comment block for the
// arithmetic; every number below is derived independently of engine code.
function handComputedConfig(): TripConfig {
  return {
    party: { adults: 2, children: [{ age: 8 }], rooms: 2 },
    timing: { startDate: '2026-06-01', season: null, nights: 4 },
    itinerary: {
      arrivalAirport: 'NRT',
      departureAirport: 'NRT',
      legs: [
        {
          cityId: 'tokyo',
          nights: 2,
          lodgingTier: 'business',
          food: { breakfast: 'casual', lunch: 'casual', dinner: 'casual' },
          activities: [{ activityId: 'test_activity_tokyo', quantity: 1 }],
          activityTierFallback: 'light',
          dayTrips: [],
          splurgeMeals: 1,
        },
        {
          cityId: 'kyoto',
          nights: 2,
          lodgingTier: 'business',
          food: { breakfast: 'casual', lunch: 'casual', dinner: 'casual' },
          activities: [],
          activityTierFallback: 'standard',
          dayTrips: [],
          splurgeMeals: 0,
        },
      ],
    },
    flight: { mode: 'cash', cashEstimateUsd: 800, taxesAndFeesUsd: 50 },
    money: { jpyPerUsd: 150, fxStressPct: 10, cardFxFeePct: 0, cashJpyPerPersonPerDay: 3000, contingencyPct: 10 },
    transport: { strategy: 'point_to_point', railClass: 'ordinary', luggageForwarding: true },
  }
}

describe('computeBudget (hand-computed fixture)', () => {
  it('matches the hand-computed total to the yen', () => {
    const result = computeBudget(handComputedConfig(), testPriceData, new Date('2026-01-01T00:00:00Z'))

    // A: 360000 (airfare) + 22500 (fees) + 3000 (departure tax) + 15000 (home-side) + 24000 (insurance) = 424500
    //
    // Departure tax is now charged at the rate in force on the departure
    // date. The trip starts 2026-06-01 and runs 4 nights, so departure is
    // 2026-06-05 — before the fixture's 2026-07-01 increase — and the rate
    // is ¥1,000/person, not ¥3,000.
    expect(result.fixedCostsJpy).toBe(424500)
    expect(result.totalsByCategory.getting_there).toBe(424500)

    // B: (40000 room + 600 tax) tokyo + (48000 room + 2400 tax) kyoto = 91000
    expect(result.totalsByCategory.lodging).toBe(91000)

    // C: 35000 point-to-point fare + 6750 luggage forwarding = 41750
    expect(result.totalsByCategory.intercity_transport).toBe(41750)

    // D: 6000 tokyo + 5400 kyoto = 11400
    expect(result.totalsByCategory.local_transport).toBe(11400)

    // E: (6000+7200+18000+90000) tokyo + (6000+7200+18000) kyoto + 18000 drinks = 170400
    expect(result.totalsByCategory.food).toBe(170400)

    // F: (12000 named + 9000 fallback) tokyo + 21000 fallback kyoto = 42000
    expect(result.totalsByCategory.activities).toBe(42000)

    // G: 9000 eSIM + 3000 coin lockers = 12000
    expect(result.totalsByCategory.connectivity).toBe(12000)

    // H: 45000 omiyage
    expect(result.totalsByCategory.shopping).toBe(45000)

    const variableCostsJpy = 91000 + 41750 + 11400 + 170400 + 42000 + 12000 + 45000
    expect(result.variableCostsJpy).toBe(variableCostsJpy)
    expect(variableCostsJpy).toBe(413550)

    const contingencyJpy = Math.round(413550 * 0.1)
    expect(result.contingencyJpy).toBe(contingencyJpy)
    expect(result.totalsByCategory.reserves).toBe(contingencyJpy)

    expect(result.totalJpyParty).toBe(424500 + 413550 + 41355)
    expect(result.totalJpyParty).toBe(879405)
    expect(result.totalJpyPerPerson).toBe(293135)

    // The airfare and ticket fees were entered in the home currency, so
    // they are tracked as a fixed home-currency amount and held out of the
    // JPY ledger's FX/card-fee exposure: (800 + 50) x 3 travellers.
    expect(result.fixedHomeCurrencyParty).toBe((800 + 50) * 3)
    expect(result.jpyLedgerParty).toBe(879405 - (360000 + 22500))

    expect(result.pointsOpportunityCostUsd).toBe(0)
    expect(result.referenceDate).toBe('2026-06-01')
  })

  it('reports zero per-person total without dividing by zero when the party is empty', () => {
    const config = baseTripConfig({
      party: { adults: 0, children: [], rooms: 1 },
      flight: { mode: 'exclude', taxesAndFeesUsd: 0 },
    })
    const result = computeBudget(config, testPriceData)
    expect(result.totalJpyPerPerson).toBe(result.totalJpyParty)
  })

  it('never adds points opportunity cost into the JPY total (§7)', () => {
    const config = baseTripConfig({
      party: { adults: 1, children: [], rooms: 1 },
      flight: { mode: 'points', taxesAndFeesUsd: 60, pointsUsed: 100000, centsPerPoint: 1.5 },
    })
    const result = computeBudget(config, testPriceData)
    expect(result.pointsOpportunityCostUsd).toBeCloseTo(1500)
    // The JPY total should equal what it would be with just taxes/fees as the getting-there cost;
    // the opportunity cost figure must not appear anywhere in totalJpyParty.
    const feesOnly = result.lineItems.find((i) => i.subcategory === 'A2')
    expect(feesOnly).toBeDefined()
    expect(result.lineItems.some((i) => i.subcategory === 'A1')).toBe(false)
  })
})
