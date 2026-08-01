import { describe, expect, it } from 'vitest'
import { fxStress, jpyToUsd, usdToJpy } from './money'

describe('usdToJpy', () => {
  it('multiplies and rounds to the nearest yen', () => {
    expect(usdToJpy(100, 150.4)).toBe(15040)
    expect(usdToJpy(100.005, 150)).toBe(15001)
  })
})

describe('jpyToUsd', () => {
  it('divides by the given rate with no fee by default', () => {
    expect(jpyToUsd(15000, 150)).toBe(100)
  })

  it('applies a card FX fee percentage on top', () => {
    expect(jpyToUsd(15000, 150, { cardFxFeePct: 3 })).toBeCloseTo(103)
  })
})

describe('fxStress', () => {
  it('produces a wider USD cost at a weaker (lower) yen rate and a narrower one at a stronger rate', () => {
    const result = fxStress(150000, 150, 10)
    expect(result.expectedUsd).toBeCloseTo(1000)
    expect(result.lowUsd).toBeLessThan(result.expectedUsd)
    expect(result.highUsd).toBeGreaterThan(result.expectedUsd)
  })

  it('passes the card FX fee through to every leg of the stress band', () => {
    const withoutFee = fxStress(150000, 150, 10)
    const withFee = fxStress(150000, 150, 10, { cardFxFeePct: 3 })
    expect(withFee.expectedUsd).toBeGreaterThan(withoutFee.expectedUsd)
  })
})
