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
