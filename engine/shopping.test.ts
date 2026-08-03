import { describe, expect, it } from 'vitest'
import { computeShopping } from './shopping'
import { testPriceData } from './testFixtures/priceData'
import { baseTripConfig } from './testFixtures/tripConfig'

describe('computeShopping', () => {
  it('always includes the omiyage budget', () => {
    const config = baseTripConfig({ party: { adults: 2, children: [], rooms: 1 } })
    const result = computeShopping(config, testPriceData)
    expect(result.lineItems.find((i) => i.subcategory === 'H1')?.amountJpy).toBe(15000 * 2)
  })

  it('defaults personal shopping to 0 and omits the line', () => {
    const config = baseTripConfig()
    const result = computeShopping(config, testPriceData)
    expect(result.lineItems.some((i) => i.subcategory === 'H2')).toBe(false)
  })

  // H2 is entered per person. This previously asserted a party-wide
  // ¥40,000 for a two-adult party, which froze the understatement bug in
  // place rather than catching it — the reason the defect survived a
  // coverage gate. Party-size scaling is now a known-answer table.
  it.each([
    [1, 40000],
    [2, 80000],
    [5, 200000],
  ])('scales the per-person shopping budget by party size: %i adults -> ¥%i', (adults, expected) => {
    const config = baseTripConfig({ party: { adults, children: [], rooms: 1 }, shopping: { personalBudgetJpy: 40000 } })
    const result = computeShopping(config, testPriceData)
    expect(result.lineItems.find((i) => i.subcategory === 'H2')?.amountJpy).toBe(expected)
  })

  it('counts children toward the per-person shopping budget', () => {
    const config = baseTripConfig({ party: { adults: 2, children: [{ age: 8 }], rooms: 2 }, shopping: { personalBudgetJpy: 10000 } })
    const result = computeShopping(config, testPriceData)
    expect(result.lineItems.find((i) => i.subcategory === 'H2')?.amountJpy).toBe(30000)
  })
})
