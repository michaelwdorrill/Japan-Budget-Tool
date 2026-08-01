import type { TripConfig } from './trip'
import type { PriceData } from './priceData'
import { multiplyByBasisRange, totalPeople } from './basis'
import { findPrice } from './priceLookup'
import type { LineItem } from './lineItem'
import { sumLineItems } from './lineItem'

// D1: IC card / local transit daily spend per leg. D2 (city transit passes)
// and D3 (taxis) are not modeled yet — no pass-comparison or taxi-frequency
// data has been seeded; both are natural additions once the guidance layer
// (Phase 7) can recommend when they beat pay-as-you-go local transit.
export function computeLocalTransport(config: TripConfig, priceData: PriceData): { lineItems: LineItem[]; totalJpy: number } {
  const people = totalPeople(config.party)
  const lineItems: LineItem[] = []

  for (const leg of config.itinerary.legs) {
    const record = findPrice(
      priceData.prices,
      (p) => p.category === 'local_transport' && p.cityId === leg.cityId,
      `local transit price for city "${leg.cityId}"`,
    )
    lineItems.push({
      id: `local-transport-${leg.cityId}`,
      label: record.label,
      category: 'local_transport',
      subcategory: 'D1',
      cityId: leg.cityId,
      ...multiplyByBasisRange(record.basis, record, { people, days: leg.nights }),
      confidence: record.confidence,
    })
  }

  return { lineItems, totalJpy: sumLineItems(lineItems) }
}
