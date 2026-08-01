import type { TripConfig } from './trip'
import type { PriceData } from './priceData'
import { multiplyByBasisRange, totalPeople } from './basis'
import { findPriceById } from './priceLookup'
import type { LineItem } from './lineItem'
import { sumLineItems } from './lineItem'
import { findTransportOption, optimizeTransport, type TransportOption } from './transportOptimizer'

// C6: luggage forwarding between city transfers, per §4.3. Independent of
// which fare strategy (C1) is chosen.
function luggageForwarding(config: TripConfig, priceData: PriceData): LineItem[] {
  if (!config.transport.luggageForwarding) return []

  const legs = config.itinerary.legs
  const transfers = Math.max(0, legs.length - 1)
  if (transfers === 0) return []

  const record = findPriceById(priceData.prices, 'luggage_forwarding_per_bag_per_transfer')
  const people = totalPeople(config.party)

  return [
    {
      id: 'transport-luggage-forwarding',
      label: record.label,
      category: 'intercity_transport',
      subcategory: 'C6',
      ...multiplyByBasisRange(record.basis, record, { fareEquivalentPeople: people, legs: transfers }),
      confidence: record.confidence,
    },
  ]
}

export interface TransportResult {
  lineItems: LineItem[]
  totalJpy: number
  options: TransportOption[] // full ranked list from the optimizer (§4.2); show the top three
}

// C1-C2: fare strategy selection. 'point_to_point' forces individual fares
// with no pass comparison; 'auto' runs the optimizer (§4) and picks the
// cheapest option; anything else is treated as an explicit pass id and that
// specific option is used even if it isn't the cheapest.
export function computeTransport(config: TripConfig, priceData: PriceData): TransportResult {
  const strategy = config.transport.strategy
  const { options } = optimizeTransport(config, priceData)

  const chosenFareLineItems =
    strategy === 'point_to_point'
      ? findTransportOption(config, priceData, 'point_to_point').lineItems
      : strategy === 'auto'
        ? options[0].lineItems
        : findTransportOption(config, priceData, strategy).lineItems

  const lineItems = [...chosenFareLineItems, ...luggageForwarding(config, priceData)]

  return { lineItems, totalJpy: sumLineItems(lineItems), options }
}
