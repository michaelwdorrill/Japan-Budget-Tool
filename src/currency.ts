// §7 multi-user seam: "Home-currency support: the FX layer already handles
// this; add a currency picker and the display layer follows." The engine's
// jpyToUsd/usdToJpy do exactly the same division/multiplication regardless
// of which currency money.jpyPerUsd is actually denominated in — this
// module is purely the display-layer half: a small picklist and a
// formatter, no new math.

export interface CurrencyOption {
  code: string
  symbol: string
  label: string
}

export const SUPPORTED_CURRENCIES: CurrencyOption[] = [
  { code: 'USD', symbol: '$', label: 'US Dollar' },
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'GBP', symbol: '£', label: 'British Pound' },
  { code: 'CAD', symbol: 'C$', label: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', label: 'Australian Dollar' },
  { code: 'CHF', symbol: 'CHF', label: 'Swiss Franc' },
  { code: 'SGD', symbol: 'S$', label: 'Singapore Dollar' },
]

const DEFAULT_CURRENCY_CODE = 'USD'

export function currencySymbolFor(currencyCode: string | undefined): string {
  return SUPPORTED_CURRENCIES.find((c) => c.code === (currencyCode ?? DEFAULT_CURRENCY_CODE))?.symbol ?? '$'
}

// Matches the existing formatUsd helpers scattered across components
// (whole units, thousands-comma'd) — just with the picked currency's
// symbol instead of a hardcoded "$".
export function formatCurrency(amount: number, currencyCode: string | undefined): string {
  const symbol = currencySymbolFor(currencyCode)
  return `${symbol}${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}
