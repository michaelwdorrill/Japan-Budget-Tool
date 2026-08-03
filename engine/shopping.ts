import type { TripConfig } from './trip'
import type { PriceData } from './priceData'
import { multiplyByBasis, multiplyByBasisRange, totalPeople } from './basis'
import { findPriceById } from './priceLookup'
import type { LineItem } from './lineItem'
import { exactAmount, sumLineItems } from './lineItem'

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
    ...multiplyByBasisRange(omiyage.basis, omiyage, { people }),
    confidence: omiyage.confidence,
  })

  // H2 is entered per person (the Money step labels it so), and therefore
  // must go through the same basis multiplication as every other
  // per-person figure. Charging it once for the whole party understated
  // the headline by (party size - 1) x the entered amount.
  const personalBudgetPerPersonJpy = config.shopping?.personalBudgetJpy ?? 0
  if (personalBudgetPerPersonJpy > 0) {
    lineItems.push({
      id: 'shopping-personal',
      label: 'Personal shopping budget',
      category: 'shopping',
      subcategory: 'H2',
      // User-set figure, not a modeled estimate — exact at every bound.
      ...exactAmount(multiplyByBasis('per_person_per_trip', personalBudgetPerPersonJpy, { people })),
      confidence: 'high',
    })
  }

  return { lineItems, totalJpy: sumLineItems(lineItems) }
}
