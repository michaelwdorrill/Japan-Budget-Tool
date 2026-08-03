import { describe, expect, it } from 'vitest'
import { computeGettingThere } from './gettingThere'
import { testPriceData } from './testFixtures/priceData'
import { baseTripConfig } from './testFixtures/tripConfig'
import type { PriceData } from './priceData'

// Every case pins an explicit departure date: the International Tourist Tax
// is a dated schedule (¥1,000 -> ¥3,000 on 2026-07-01 in the fixture), so a
// date is now a required input rather than an implicit "today".
const AFTER_INCREASE = '2026-09-10'
const BEFORE_INCREASE = '2026-06-30'

describe('computeGettingThere', () => {
  it('holds a cash airfare fixed in the home currency and reports its JPY value at the nominal rate', () => {
    const config = baseTripConfig({
      party: { adults: 2, children: [], rooms: 1 },
      flight: { mode: 'cash', cashEstimateUsd: 1000, taxesAndFeesUsd: 100 },
      money: { jpyPerUsd: 150, fxStressPct: 10, cardFxFeePct: 0, cashJpyPerPersonPerDay: 3000, contingencyPct: 10 },
    })
    const result = computeGettingThere(config, testPriceData, AFTER_INCREASE)
    const airfareLine = result.lineItems.find((i) => i.subcategory === 'A1')
    expect(airfareLine?.amountJpy).toBe(1000 * 150 * 2)
    // The home-currency amount is the one that is actually fixed.
    expect(airfareLine?.fixedHomeCurrencyAmount).toBe(2000)
    expect(airfareLine?.uncertainty).toBe('fixed')
  })

  it('throws when flight.mode is cash but cashEstimateUsd is not set', () => {
    const config = baseTripConfig({ flight: { mode: 'cash', taxesAndFeesUsd: 100 } })
    expect(() => computeGettingThere(config, testPriceData, AFTER_INCREASE)).toThrow(/cashEstimateUsd/)
  })

  it('charges taxes and fees even when flight.mode is points, and holds them fixed in home currency', () => {
    const config = baseTripConfig({
      party: { adults: 1, children: [], rooms: 1 },
      flight: { mode: 'points', taxesAndFeesUsd: 60, pointsUsed: 50000, centsPerPoint: 1.2 },
      money: { jpyPerUsd: 150, fxStressPct: 10, cardFxFeePct: 0, cashJpyPerPersonPerDay: 3000, contingencyPct: 10 },
    })
    const result = computeGettingThere(config, testPriceData, AFTER_INCREASE)
    expect(result.lineItems.some((i) => i.subcategory === 'A1')).toBe(false)
    const feesLine = result.lineItems.find((i) => i.subcategory === 'A2')
    expect(feesLine?.amountJpy).toBe(60 * 150)
    expect(feesLine?.fixedHomeCurrencyAmount).toBe(60)
    expect(result.pointsOpportunityCostUsd).toBeCloseTo((50000 * 1.2) / 100)
  })

  it('reports zero points opportunity cost when pointsUsed/centsPerPoint are not set', () => {
    const config = baseTripConfig({ flight: { mode: 'points', taxesAndFeesUsd: 60 } })
    expect(computeGettingThere(config, testPriceData, AFTER_INCREASE).pointsOpportunityCostUsd).toBe(0)
  })

  it('reports zero points opportunity cost for excluded flights', () => {
    const config = baseTripConfig({ flight: { mode: 'exclude', taxesAndFeesUsd: 0 } })
    const result = computeGettingThere(config, testPriceData, AFTER_INCREASE)
    expect(result.lineItems.some((i) => i.subcategory === 'A1')).toBe(false)
    expect(result.pointsOpportunityCostUsd).toBe(0)
  })

  describe('departure tax is charged at the rate in force on the departure date', () => {
    it('charges the pre-increase rate for a departure before the change', () => {
      const config = baseTripConfig({ party: { adults: 2, children: [], rooms: 1 } })
      const result = computeGettingThere(config, testPriceData, BEFORE_INCREASE)
      expect(result.lineItems.find((i) => i.subcategory === 'A3')?.amountJpy).toBe(1000 * 2)
    })

    it('charges the post-increase rate for a departure on the change date', () => {
      const config = baseTripConfig({ party: { adults: 2, children: [], rooms: 1 } })
      const result = computeGettingThere(config, testPriceData, '2026-07-01')
      expect(result.lineItems.find((i) => i.subcategory === 'A3')?.amountJpy).toBe(3000 * 2)
    })

    it('exempts children below the record exemption age', () => {
      const config = baseTripConfig({ party: { adults: 2, children: [{ age: 1 }, { age: 4 }], rooms: 2 } })
      const result = computeGettingThere(config, testPriceData, AFTER_INCREASE)
      // 2 adults + the 4-year-old pay; the 1-year-old is exempt.
      expect(result.lineItems.find((i) => i.subcategory === 'A3')?.amountJpy).toBe(3000 * 3)
    })

    it('marks the departure tax as fixed so the roll-up cannot widen it', () => {
      const config = baseTripConfig()
      const result = computeGettingThere(config, testPriceData, AFTER_INCREASE)
      const taxLine = result.lineItems.find((i) => i.subcategory === 'A3')
      expect(taxLine?.uncertainty).toBe('fixed')
      expect(taxLine?.lowJpy).toBe(taxLine?.highJpy)
    })

    it('omits the line entirely when no schedule covers the departure date', () => {
      const noScheduleData: PriceData = {
        ...testPriceData,
        taxes: { ...testPriceData.taxes, departureTax: [] },
      }
      const result = computeGettingThere(baseTripConfig(), noScheduleData, AFTER_INCREASE)
      expect(result.lineItems.some((i) => i.subcategory === 'A3')).toBe(false)
    })
  })

  it('always includes home-side transport and travel insurance', () => {
    const result = computeGettingThere(baseTripConfig(), testPriceData, AFTER_INCREASE)
    expect(result.lineItems.some((i) => i.subcategory === 'A4')).toBe(true)
    expect(result.lineItems.some((i) => i.subcategory === 'A5')).toBe(true)
  })
})
