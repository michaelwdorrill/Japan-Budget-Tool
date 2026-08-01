import type { Category } from './price'

export interface LineItem {
  id: string
  label: string
  category: Category
  subcategory: string // §3.1 code, e.g. "B1", "E4"
  cityId?: string
  amountJpy: number
  confidence: 'high' | 'medium' | 'low'
  notes?: string
}

export function sumLineItems(lineItems: LineItem[]): number {
  return lineItems.reduce((sum, item) => sum + item.amountJpy, 0)
}
