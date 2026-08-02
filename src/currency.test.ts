import { describe, expect, it } from 'vitest'
import { currencySymbolFor, formatCurrency, SUPPORTED_CURRENCIES } from './currency'

describe('currencySymbolFor', () => {
  it('returns the symbol for a supported currency code', () => {
    expect(currencySymbolFor('EUR')).toBe('€')
    expect(currencySymbolFor('GBP')).toBe('£')
  })

  it('defaults to USD when the code is undefined', () => {
    expect(currencySymbolFor(undefined)).toBe('$')
  })

  it('falls back to $ for an unrecognized code', () => {
    expect(currencySymbolFor('XYZ')).toBe('$')
  })

  it('every supported currency has a unique code', () => {
    const codes = SUPPORTED_CURRENCIES.map((c) => c.code)
    expect(new Set(codes).size).toBe(codes.length)
  })
})

describe('formatCurrency', () => {
  it('formats with the currency symbol and thousands separators', () => {
    expect(formatCurrency(1234, 'USD')).toBe('$1,234')
    expect(formatCurrency(1234, 'EUR')).toBe('€1,234')
  })

  it('rounds to whole units', () => {
    expect(formatCurrency(1234.6, 'USD')).toBe('$1,235')
  })

  it('defaults to $ when currencyCode is undefined', () => {
    expect(formatCurrency(500, undefined)).toBe('$500')
  })
})
