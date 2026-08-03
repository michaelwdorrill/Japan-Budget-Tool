import type { TripConfig } from './trip'
import type { PriceData } from './priceData'
import { multiplyByBasisRange, totalPeople } from './basis'
import { findPriceById } from './priceLookup'
import { departureTax } from './tax'
import { usdToJpy } from './money'
import type { LineItem } from './lineItem'
import { exactAmount, sumLineItems } from './lineItem'

export interface GettingThereResult {
  lineItems: LineItem[]
  totalJpy: number
  pointsOpportunityCostUsd: number // display-only, never part of totalJpy (§7)
}

// A1-A5. Airfare (A1) depends on flight.mode: 'cash' is a purchase the
// traveller already makes in their home currency; 'points' contributes 0
// cash cost but still surfaces the opportunity-cost estimate for display;
// 'exclude' contributes 0 and no opportunity cost.
//
// A1/A2 carry `fixedHomeCurrencyAmount`: a $1,000 ticket stays $1,000. The
// JPY figures are a presentation convenience at the nominal rate so the
// line still appears in the JPY ledger, but the uncertainty roll-up must
// not apply JPY FX movement or a Japan card fee to a purchase already
// settled at home.
export function computeGettingThere(config: TripConfig, priceData: PriceData, departureDate: string): GettingThereResult {
  const people = totalPeople(config.party)
  const lineItems: LineItem[] = []

  if (config.flight.mode === 'cash') {
    if (config.flight.cashEstimateUsd === undefined) {
      throw new Error('flight.mode is "cash" but flight.cashEstimateUsd is not set')
    }
    const airfareHomeCurrency = config.flight.cashEstimateUsd * people
    lineItems.push({
      id: 'getting-there-airfare-cash',
      label: 'International airfare (cash, fixed in home currency)',
      category: 'getting_there',
      subcategory: 'A1',
      // User-entered estimate, no low/high band of its own.
      ...exactAmount(usdToJpy(airfareHomeCurrency, config.money.jpyPerUsd)),
      confidence: 'medium',
      uncertainty: 'fixed',
      fixedHomeCurrencyAmount: airfareHomeCurrency,
    })
  }

  const taxesAndFeesHomeCurrency = config.flight.taxesAndFeesUsd * people
  lineItems.push({
    id: 'getting-there-taxes-fees',
    label: 'Award/ticket taxes, fees, carrier surcharges (fixed in home currency)',
    category: 'getting_there',
    subcategory: 'A2',
    ...exactAmount(usdToJpy(taxesAndFeesHomeCurrency, config.money.jpyPerUsd)),
    confidence: 'medium',
    uncertainty: 'fixed',
    fixedHomeCurrencyAmount: taxesAndFeesHomeCurrency,
  })

  const departure = departureTax(priceData.taxes, config.party, departureDate)
  if (departure.totalTaxJpy > 0) {
    lineItems.push({
      id: 'getting-there-departure-tax',
      label: `Japan international tourist departure tax (¥${departure.amountJpyPerPerson.toLocaleString('en-US')}/person on ${departureDate})`,
      category: 'getting_there',
      subcategory: 'A3',
      // A published statutory charge — exact, and never widened by market
      // volatility in the uncertainty roll-up.
      ...exactAmount(departure.totalTaxJpy),
      confidence: 'high',
      uncertainty: 'fixed',
    })
  }

  const homeSideTransport = findPriceById(priceData.prices, 'home_side_transport')
  lineItems.push({
    id: 'getting-there-home-side-transport',
    label: homeSideTransport.label,
    category: 'getting_there',
    subcategory: 'A4',
    ...multiplyByBasisRange(homeSideTransport.basis, homeSideTransport, { people }),
    confidence: homeSideTransport.confidence,
  })

  const insurance = findPriceById(priceData.prices, 'travel_insurance')
  lineItems.push({
    id: 'getting-there-insurance',
    label: insurance.label,
    category: 'getting_there',
    subcategory: 'A5',
    ...multiplyByBasisRange(insurance.basis, insurance, { people }),
    confidence: insurance.confidence,
  })

  const pointsOpportunityCostUsd =
    config.flight.mode === 'points' && config.flight.pointsUsed !== undefined && config.flight.centsPerPoint !== undefined
      ? (config.flight.pointsUsed * config.flight.centsPerPoint) / 100
      : 0

  return { lineItems, totalJpy: sumLineItems(lineItems), pointsOpportunityCostUsd }
}
