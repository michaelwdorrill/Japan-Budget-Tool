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

  it('includes personal shopping when the user sets a budget', () => {
    const config = baseTripConfig({ shopping: { personalBudgetJpy: 40000 } })
    const result = computeShopping(config, testPriceData)
    const line = result.lineItems.find((i) => i.subcategory === 'H2')
    expect(line?.amountJpy).toBe(40000)
  })
})
