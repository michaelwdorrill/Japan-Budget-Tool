import { describe, expect, it } from 'vitest'
import { computeGettingThere } from './gettingThere'
import { testPriceData } from './testFixtures/priceData'
import { baseTripConfig } from './testFixtures/tripConfig'
import type { PriceData } from './priceData'

describe('computeGettingThere', () => {
  it('converts a cash airfare estimate to JPY and multiplies by people', () => {
    const config = baseTripConfig({
      party: { adults: 2, children: [], rooms: 1 },
      flight: { mode: 'cash', cashEstimateUsd: 1000, taxesAndFeesUsd: 100 },
      money: { jpyPerUsd: 150, fxStressPct: 10, cardFxFeePct: 0, cashJpyPerPersonPerDay: 3000, contingencyPct: 10 },
    })
    const result = computeGettingThere(config, testPriceData)
    const airfareLine = result.lineItems.find((i) => i.subcategory === 'A1')
    expect(airfareLine?.amountJpy).toBe(1000 * 150 * 2)
  })

  it('throws when flight.mode is cash but cashEstimateUsd is not set', () => {
    const config = baseTripConfig({ flight: { mode: 'cash', taxesAndFeesUsd: 100 } })
    expect(() => computeGettingThere(config, testPriceData)).toThrow(/cashEstimateUsd/)
  })

  it('charges taxes and fees even when flight.mode is points', () => {
    const config = baseTripConfig({
      party: { adults: 1, children: [], rooms: 1 },
      flight: { mode: 'points', taxesAndFeesUsd: 60, pointsUsed: 50000, centsPerPoint: 1.2 },
      money: { jpyPerUsd: 150, fxStressPct: 10, cardFxFeePct: 0, cashJpyPerPersonPerDay: 3000, contingencyPct: 10 },
    })
    const result = computeGettingThere(config, testPriceData)
    expect(result.lineItems.some((i) => i.subcategory === 'A1')).toBe(false)
    const feesLine = result.lineItems.find((i) => i.subcategory === 'A2')
    expect(feesLine?.amountJpy).toBe(60 * 150)
    expect(result.pointsOpportunityCostUsd).toBeCloseTo((50000 * 1.2) / 100)
  })

  it('reports zero points opportunity cost when pointsUsed/centsPerPoint are not set', () => {
    const config = baseTripConfig({ flight: { mode: 'points', taxesAndFeesUsd: 60 } })
    const result = computeGettingThere(config, testPriceData)
    expect(result.pointsOpportunityCostUsd).toBe(0)
  })

  it('reports zero points opportunity cost for excluded flights', () => {
    const config = baseTripConfig({ flight: { mode: 'exclude', taxesAndFeesUsd: 0 } })
    const result = computeGettingThere(config, testPriceData)
    expect(result.lineItems.some((i) => i.subcategory === 'A1')).toBe(false)
    expect(result.pointsOpportunityCostUsd).toBe(0)
  })

  it('omits the departure tax line when the amount is zero', () => {
    const zeroTaxData: PriceData = {
      ...testPriceData,
      taxes: { ...testPriceData.taxes, departureTax: { ...testPriceData.taxes.departureTax, amountJpy: 0 } },
    }
    const config = baseTripConfig()
    const result = computeGettingThere(config, zeroTaxData)
    expect(result.lineItems.some((i) => i.subcategory === 'A3')).toBe(false)
  })

  it('labels the departure tax differently when not collected via airfare', () => {
    const separateTaxData: PriceData = {
      ...testPriceData,
      taxes: { ...testPriceData.taxes, departureTax: { ...testPriceData.taxes.departureTax, collectedVia: 'separate payment' } },
    }
    const config = baseTripConfig()
    const result = computeGettingThere(config, separateTaxData)
    const taxLine = result.lineItems.find((i) => i.subcategory === 'A3')
    expect(taxLine?.label).toBe('Japan international tourist departure tax')
  })

  it('always includes home-side transport and travel insurance', () => {
    const config = baseTripConfig()
    const result = computeGettingThere(config, testPriceData)
    expect(result.lineItems.some((i) => i.subcategory === 'A4')).toBe(true)
    expect(result.lineItems.some((i) => i.subcategory === 'A5')).toBe(true)
  })
})
