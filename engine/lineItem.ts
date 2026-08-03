import type { Category } from './price'

export interface LineItem {
  id: string
  label: string
  category: Category
  subcategory: string // §3.1 code, e.g. "B1", "E4"
  cityId?: string
  amountJpy: number // the expected value; what the deterministic engine sums
  lowJpy: number // §0.1: every line carries a low/expected/high band
  highJpy: number
  confidence: 'high' | 'medium' | 'low'
  notes?: string

  // How the uncertainty roll-up (§3.3) should treat this line. 'market'
  // (the default when unset) means PERT-sample it and apply its category's
  // shared market factor. 'fixed' means it is a published statutory charge
  // or an exact user-entered figure: a point mass that must never widen
  // with hotel or restaurant market volatility.
  uncertainty?: 'market' | 'fixed'

  // Set when the line is a purchase already fixed in the traveller's home
  // currency (a booked airfare, ticket taxes paid at booking). The JPY
  // figures above are a presentation convenience at the nominal rate; this
  // amount is what is actually fixed, so JPY FX uncertainty and Japan card
  // fees must not be applied to it.
  fixedHomeCurrencyAmount?: number
}

// Total of the amounts already fixed in the traveller's home currency.
// These bypass the JPY ledger's FX and card-fee exposure entirely.
export function sumFixedHomeCurrency(lineItems: LineItem[]): number {
  return lineItems.reduce((sum, item) => sum + (item.fixedHomeCurrencyAmount ?? 0), 0)
}

export function sumLineItems(lineItems: LineItem[]): number {
  return lineItems.reduce((sum, item) => sum + item.amountJpy, 0)
}

// For amounts with no low/expected/high band in their source data — a
// user-entered figure (flight cash estimate, taxes/fees) or a
// government/JR-published exact price (departure tax, rail fares, pass
// prices). Modeled as a point mass: low = expected = high.
export function exactAmount(amountJpy: number): { lowJpy: number; amountJpy: number; highJpy: number } {
  return { lowJpy: amountJpy, amountJpy, highJpy: amountJpy }
}
