import type { TripConfig } from './trip'
import type { PriceData, RailFareRecord } from './priceData'
import { fareEquivalentPeople, multiplyByBasis, totalPeople } from './basis'
import { findPriceById } from './priceLookup'
import type { LineItem } from './lineItem'
import { sumLineItems } from './lineItem'

function findRailFare(railFares: RailFareRecord[], fromCityId: string, toCityId: string): RailFareRecord {
  const direct = railFares.find((f) => f.fromCityId === fromCityId && f.toCityId === toCityId)
  if (direct) return direct

  const reverse = railFares.find((f) => f.bidirectional && f.fromCityId === toCityId && f.toCityId === fromCityId)
  if (reverse) return reverse

  throw new Error(`no rail fare found for ${fromCityId} -> ${toCityId}`)
}

function fareForClass(record: RailFareRecord, railClass: TripConfig['transport']['railClass']): number {
  if (railClass === 'green') return record.fareJpyGreenCar ?? record.fareJpyReserved
  return record.fareJpyReserved
}

// C1: point-to-point fares between consecutive legs. This is the Phase 2
// baseline; comparing point-to-point against JR Pass tiers and regional
// passes to pick the cheapest option is the transport optimizer (§4),
// scheduled for Phase 4. C2 (Nozomi/Mizuho supplements), C3 (seat/luggage
// reservations), C4 (domestic flights), and C5 (airport transfers) are not
// priced yet for the same reason — they only matter once the optimizer can
// choose between fare strategies.
function pointToPointFares(config: TripConfig, priceData: PriceData): LineItem[] {
  const legs = config.itinerary.legs
  const fareEqPeople = fareEquivalentPeople(config.party)
  const lineItems: LineItem[] = []

  for (let i = 0; i < legs.length - 1; i++) {
    const fromCityId = legs[i].cityId
    const toCityId = legs[i + 1].cityId
    if (fromCityId === toCityId) continue

    const record = findRailFare(priceData.railFares, fromCityId, toCityId)
    const fareJpy = fareForClass(record, config.transport.railClass)
    lineItems.push({
      id: `transport-fare-${record.id}-${i}`,
      label: `${record.line}, ${fromCityId} -> ${toCityId}`,
      category: 'intercity_transport',
      subcategory: 'C1',
      amountJpy: multiplyByBasis('per_person_per_leg', fareJpy, { fareEquivalentPeople: fareEqPeople, legs: 1 }),
      confidence: record.confidence,
    })
  }

  return lineItems
}

function nationalPassFares(config: TripConfig, priceData: PriceData, passId: string): LineItem[] {
  const pass = priceData.passes.nationalPasses.find((p) => p.id === passId)
  if (!pass) {
    throw new Error(`unknown JR pass id "${passId}"`)
  }

  const adults = config.party.adults
  const childrenFullFare = config.party.children.filter((c) => c.age >= 12).length
  const childrenHalfFare = config.party.children.filter((c) => c.age >= 6 && c.age <= 11).length
  // Children under 6 travel free and need no pass.

  const fullFareCount = adults + childrenFullFare
  const halfFareCount = childrenHalfFare
  const totalJpy =
    fullFareCount * pass.priceJpyOfficialChannel + halfFareCount * Math.round(pass.priceJpyOfficialChannel * (pass.childDiscountPct / 100))

  return [
    {
      id: `transport-pass-${pass.id}`,
      label: pass.label,
      category: 'intercity_transport',
      subcategory: 'C1',
      amountJpy: totalJpy,
      confidence: pass.confidence,
      notes: pass.notes,
    },
  ]
}

// C6: luggage forwarding between city transfers, per §4.3.
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
      amountJpy: multiplyByBasis(record.basis, record.expected, { fareEquivalentPeople: people, legs: transfers }),
      confidence: record.confidence,
    },
  ]
}

export interface TransportResult {
  lineItems: LineItem[]
  totalJpy: number
}

export function computeTransport(config: TripConfig, priceData: PriceData): TransportResult {
  const strategy = config.transport.strategy
  const isExplicitPassId = strategy !== 'auto' && strategy !== 'point_to_point'

  const fareLineItems = isExplicitPassId
    ? nationalPassFares(config, priceData, strategy)
    : pointToPointFares(config, priceData)

  const lineItems = [...fareLineItems, ...luggageForwarding(config, priceData)]

  return { lineItems, totalJpy: sumLineItems(lineItems) }
}
