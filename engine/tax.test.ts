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
  const party = (adults: number, children: { age: number }[] = []) => ({ adults, children })

  it('multiplies the applicable rate by chargeable headcount', () => {
    expect(departureTax(testPriceData.taxes, party(3), '2026-09-10').totalTaxJpy).toBe(9000)
  })

  it('picks the schedule in force on the departure date', () => {
    expect(departureTax(testPriceData.taxes, party(1), '2026-06-30').amountJpyPerPerson).toBe(1000)
    expect(departureTax(testPriceData.taxes, party(1), '2026-07-01').amountJpyPerPerson).toBe(3000)
  })

  it('exempts children under the record exemption age', () => {
    const result = departureTax(testPriceData.taxes, party(2, [{ age: 1 }, { age: 2 }]), '2026-09-10')
    expect(result.chargeablePeople).toBe(3)
    expect(result.totalTaxJpy).toBe(9000)
  })

  it('returns zero when no schedule covers the date', () => {
    const result = departureTax(testPriceData.taxes, party(2), '2000-01-01')
    expect(result.totalTaxJpy).toBe(0)
    expect(result.recordId).toBeNull()
  })
})

// Regression: `effectiveTo` is inclusive. Treating it as exclusive left a
// one-day hole on the boundary date where no record matched and the city
// silently charged zero.
describe('accommodation tax schedule boundaries', () => {
  it('charges the outgoing rule on its final day, not zero', () => {
    // testville_before ends 2026-06-14; testville_after starts 2026-06-15.
    expect(lodgingTax(testPriceData.taxes, 'testville', 10000, 1, 1, '2026-06-14').taxJpyPerPersonPerNight).toBe(100)
  })

  it('charges the incoming rule from its first day', () => {
    expect(lodgingTax(testPriceData.taxes, 'testville', 10000, 1, 1, '2026-06-15').taxJpyPerPersonPerNight).toBe(200)
  })
})

// Known answers taken from the published Tokyo schedule, not from the
// engine: below the ¥13,000 floor the stay is exempt outright, and above it
// fractional yen are truncated.
describe('percentage tax exemption floor (Tokyo 2027)', () => {
  it.each([
    [10000, 0],
    [12999, 0],
    [13000, 390],
    [13017, 390],
    [20000, 600],
  ])('¥%i/person/night -> ¥%i', (rate, expected) => {
    expect(lodgingTax(testPriceData.taxes, 'tokyo', rate, 1, 1, '2027-06-01').taxJpyPerPersonPerNight).toBe(expected)
  })
})
