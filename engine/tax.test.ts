import { describe, expect, it } from 'vitest'
import { departureTax, lodgingTax } from './tax'
import { testPriceData } from './testFixtures/priceData'

describe('lodgingTax', () => {
  it('applies the correct Kyoto bracket and totals across nights and people', () => {
    // ¥8,000/person/night falls in the ¥6,000-19,999 bracket -> ¥400/night.
    const result = lodgingTax(testPriceData.taxes, 'kyoto', 8000, 3, 2, '2026-06-01')
    expect(result.taxJpyPerPersonPerNight).toBe(400)
    expect(result.totalTaxJpy).toBe(400 * 3 * 2)
  })

  it('applies the top Kyoto bracket at the ¥100,000 cliff', () => {
    const result = lodgingTax(testPriceData.taxes, 'kyoto', 100000, 1, 1, '2026-06-01')
    expect(result.taxJpyPerPersonPerNight).toBe(10000)
  })

  it('warns when a rate sits just below a bracket edge', () => {
    // ¥19,500 is within 10% (¥1,950) of the ¥20,000 floor of the next bracket.
    const result = lodgingTax(testPriceData.taxes, 'kyoto', 19500, 1, 1, '2026-06-01')
    expect(result.bracketEdgeWarning).not.toBeNull()
    expect(result.bracketEdgeWarning?.edgeJpy).toBe(20000)
    expect(result.bracketEdgeWarning?.taxDeltaJpyPerPersonPerNight).toBe(600)
  })

  it('warns when a rate sits just above a bracket edge it recently crossed', () => {
    // ¥21,000 just crossed into the 20,000-49,999 bracket; within 10% of the ¥20,000 floor.
    const result = lodgingTax(testPriceData.taxes, 'kyoto', 21000, 1, 1, '2026-06-01')
    expect(result.bracketEdgeWarning).not.toBeNull()
    expect(result.bracketEdgeWarning?.edgeJpy).toBe(20000)
  })

  it('does not warn when a rate is comfortably inside a bracket', () => {
    const result = lodgingTax(testPriceData.taxes, 'kyoto', 12000, 1, 1, '2026-06-01')
    expect(result.bracketEdgeWarning).toBeNull()
  })

  it('applies flat per-person-per-night tax structures', () => {
    const result = lodgingTax(testPriceData.taxes, 'tokyo', 12000, 2, 2, '2026-06-01')
    expect(result.taxJpyPerPersonPerNight).toBe(100)
    expect(result.totalTaxJpy).toBe(400)
  })

  it('applies percentage-based tax structures effective on a later date', () => {
    const result = lodgingTax(testPriceData.taxes, 'tokyo', 20000, 1, 1, '2027-05-01')
    expect(result.taxJpyPerPersonPerNight).toBe(600)
  })

  it('returns zero tax for a city with no applicable record', () => {
    const result = lodgingTax(testPriceData.taxes, 'osaka', 20000, 2, 2, '2026-06-01')
    expect(result.totalTaxJpy).toBe(0)
    expect(result.bracketEdgeWarning).toBeNull()
  })

  it('returns zero tax for a date before any record is effective', () => {
    const result = lodgingTax(testPriceData.taxes, 'kyoto', 20000, 1, 1, '2020-01-01')
    expect(result.totalTaxJpy).toBe(0)
  })
})

describe('departureTax', () => {
  it('multiplies the flat departure tax by headcount', () => {
    expect(departureTax(testPriceData.taxes, 3)).toBe(9000)
  })
})
