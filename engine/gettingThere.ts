import type { TripConfig } from './trip'
import type { PriceData } from './priceData'
import { multiplyByBasis, totalPeople } from './basis'
import { findPriceById } from './priceLookup'
import { departureTax } from './tax'
import { usdToJpy } from './money'
import type { LineItem } from './lineItem'
import { sumLineItems } from './lineItem'

export interface GettingThereResult {
  lineItems: LineItem[]
  totalJpy: number
  pointsOpportunityCostUsd: number // display-only, never part of totalJpy (§7)
}

// A1-A5. Airfare (A1) depends on flight.mode: 'cash' converts the per-person
// USD estimate to JPY once at this input boundary; 'points' contributes 0
// cash cost but still surfaces the opportunity-cost estimate for display;
// 'exclude' contributes 0 and no opportunity cost.
export function computeGettingThere(config: TripConfig, priceData: PriceData): GettingThereResult {
  const people = totalPeople(config.party)
  const lineItems: LineItem[] = []

  if (config.flight.mode === 'cash') {
    if (config.flight.cashEstimateUsd === undefined) {
      throw new Error('flight.mode is "cash" but flight.cashEstimateUsd is not set')
    }
    lineItems.push({
      id: 'getting-there-airfare-cash',
      label: 'International airfare (cash)',
      category: 'getting_there',
      subcategory: 'A1',
      amountJpy: usdToJpy(config.flight.cashEstimateUsd, config.money.jpyPerUsd) * people,
      confidence: 'medium',
    })
  }

  lineItems.push({
    id: 'getting-there-taxes-fees',
    label: 'Award/ticket taxes, fees, carrier surcharges',
    category: 'getting_there',
    subcategory: 'A2',
    amountJpy: usdToJpy(config.flight.taxesAndFeesUsd, config.money.jpyPerUsd) * people,
    confidence: 'medium',
  })

  const departureTaxJpy = departureTax(priceData.taxes, people)
  if (departureTaxJpy > 0) {
    lineItems.push({
      id: 'getting-there-departure-tax',
      label: priceData.taxes.departureTax.collectedVia === 'airfare'
        ? 'Japan international tourist departure tax (collected via airfare)'
        : 'Japan international tourist departure tax',
      category: 'getting_there',
      subcategory: 'A3',
      amountJpy: departureTaxJpy,
      confidence: priceData.taxes.departureTax.confidence,
    })
  }

  const homeSideTransport = findPriceById(priceData.prices, 'home_side_transport')
  lineItems.push({
    id: 'getting-there-home-side-transport',
    label: homeSideTransport.label,
    category: 'getting_there',
    subcategory: 'A4',
    amountJpy: multiplyByBasis(homeSideTransport.basis, homeSideTransport.expected, { people }),
    confidence: homeSideTransport.confidence,
  })

  const insurance = findPriceById(priceData.prices, 'travel_insurance')
  lineItems.push({
    id: 'getting-there-insurance',
    label: insurance.label,
    category: 'getting_there',
    subcategory: 'A5',
    amountJpy: multiplyByBasis(insurance.basis, insurance.expected, { people }),
    confidence: insurance.confidence,
  })

  const pointsOpportunityCostUsd =
    config.flight.mode === 'points' && config.flight.pointsUsed !== undefined && config.flight.centsPerPoint !== undefined
      ? (config.flight.pointsUsed * config.flight.centsPerPoint) / 100
      : 0

  return { lineItems, totalJpy: sumLineItems(lineItems), pointsOpportunityCostUsd }
}
