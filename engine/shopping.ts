import type { TripConfig } from './trip'
import type { PriceData } from './priceData'
import { multiplyByBasis, totalPeople } from './basis'
import { findPriceById } from './priceLookup'
import type { LineItem } from './lineItem'
import { sumLineItems } from './lineItem'

// H1: omiyage budget, always included. H2: personal shopping budget,
// user-set via TripConfig.shopping.personalBudgetJpy; defaults to 0 per §7.
export function computeShopping(config: TripConfig, priceData: PriceData): { lineItems: LineItem[]; totalJpy: number } {
  const people = totalPeople(config.party)
  const lineItems: LineItem[] = []

  const omiyage = findPriceById(priceData.prices, 'omiyage_budget')
  lineItems.push({
    id: 'shopping-omiyage',
    label: omiyage.label,
    category: 'shopping',
    subcategory: 'H1',
    amountJpy: multiplyByBasis(omiyage.basis, omiyage.expected, { people }),
    confidence: omiyage.confidence,
  })

  const personalBudgetJpy = config.shopping?.personalBudgetJpy ?? 0
  if (personalBudgetJpy > 0) {
    lineItems.push({
      id: 'shopping-personal',
      label: 'Personal shopping budget',
      category: 'shopping',
      subcategory: 'H2',
      amountJpy: personalBudgetJpy,
      confidence: 'high',
    })
  }

  return { lineItems, totalJpy: sumLineItems(lineItems) }
}
