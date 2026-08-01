import type { TripConfig } from './trip'
import type { PriceData } from './priceData'
import { multiplyByBasis, totalPeople } from './basis'
import { findPriceById } from './priceLookup'
import type { LineItem } from './lineItem'
import { sumLineItems } from './lineItem'

const LAUNDRY_THRESHOLD_NIGHTS = 10

function totalNights(config: TripConfig): number {
  return config.itinerary.legs.reduce((sum, leg) => sum + leg.nights, 0)
}

// G1: TripConfig has no explicit connectivity choice, so this picks an eSIM
// duration tier from trip length (<=7 nights -> 7-day eSIM, else 14-day) as
// a reasonable per-person default. G2: coin lockers are assumed for every
// trip; laundry is added only past the >10-night threshold called out in
// §5.2's guidance rule.
export function computeConnectivity(config: TripConfig, priceData: PriceData): { lineItems: LineItem[]; totalJpy: number } {
  const people = totalPeople(config.party)
  const nights = totalNights(config)
  const lineItems: LineItem[] = []

  const esimId = nights <= 7 ? 'esim_7day' : 'esim_14day'
  const esim = findPriceById(priceData.prices, esimId)
  lineItems.push({
    id: `connectivity-${esim.id}`,
    label: esim.label,
    category: 'connectivity',
    subcategory: 'G1',
    amountJpy: multiplyByBasis(esim.basis, esim.expected, { people }),
    confidence: esim.confidence,
  })

  const coinLockers = findPriceById(priceData.prices, 'coin_lockers')
  lineItems.push({
    id: 'connectivity-coin-lockers',
    label: coinLockers.label,
    category: 'connectivity',
    subcategory: 'G2',
    amountJpy: multiplyByBasis(coinLockers.basis, coinLockers.expected, { people }),
    confidence: coinLockers.confidence,
  })

  if (nights > LAUNDRY_THRESHOLD_NIGHTS) {
    const laundry = findPriceById(priceData.prices, 'laundry')
    lineItems.push({
      id: 'connectivity-laundry',
      label: laundry.label,
      category: 'connectivity',
      subcategory: 'G2',
      amountJpy: multiplyByBasis(laundry.basis, laundry.expected, { people }),
      confidence: laundry.confidence,
    })
  }

  return { lineItems, totalJpy: sumLineItems(lineItems) }
}
