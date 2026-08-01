import type { Leg, TripConfig } from './trip'
import type { PriceData } from './priceData'
import { multiplyByBasis, totalPeople } from './basis'
import { lodgingTax } from './tax'
import { findPrice } from './priceLookup'
import type { LineItem } from './lineItem'
import { sumLineItems } from './lineItem'

export interface LegLodgingResult {
  lineItems: LineItem[]
  bracketEdgeWarning: ReturnType<typeof lodgingTax>['bracketEdgeWarning']
}

// B1 (room/bed cost) + B2 (municipal accommodation tax). B3 (a distinct
// onsen/bathing tax) is not modeled separately: every seeded municipality's
// tax record already represents the full per-person-per-night charge, so a
// separate B3 line would double count. Revisit if a city adds a genuinely
// separate bathing tax on top of its accommodation tax.
export function legLodgingCost(
  leg: Leg,
  party: TripConfig['party'],
  priceData: PriceData,
  referenceDate: string,
): LegLodgingResult {
  const people = totalPeople(party)
  const record = findPrice(
    priceData.prices,
    (p) => p.category === 'lodging' && p.cityId === leg.cityId && p.tier === leg.lodgingTier,
    `lodging tier "${leg.lodgingTier}" in city "${leg.cityId}"`,
  )

  const roomCostJpy = multiplyByBasis(record.basis, record.expected, {
    people,
    rooms: party.rooms,
    nights: leg.nights,
  })

  const nightlyRatePerPersonJpy = leg.nights > 0 && people > 0 ? Math.round(roomCostJpy / (leg.nights * people)) : 0

  const tax = lodgingTax(priceData.taxes, leg.cityId, nightlyRatePerPersonJpy, leg.nights, people, referenceDate)

  const lineItems: LineItem[] = [
    {
      id: `lodging-room-${leg.cityId}-${record.id}`,
      label: record.label,
      category: 'lodging',
      subcategory: 'B1',
      cityId: leg.cityId,
      amountJpy: roomCostJpy,
      confidence: record.confidence,
    },
  ]

  if (tax.totalTaxJpy > 0) {
    lineItems.push({
      id: `lodging-tax-${leg.cityId}`,
      label: `Municipal accommodation tax, ${leg.cityId}`,
      category: 'lodging',
      subcategory: 'B2',
      cityId: leg.cityId,
      amountJpy: tax.totalTaxJpy,
      confidence: 'medium',
    })
  }

  return { lineItems, bracketEdgeWarning: tax.bracketEdgeWarning }
}

export interface LodgingResult {
  lineItems: LineItem[]
  totalJpy: number
  bracketEdgeWarnings: Array<{ cityId: string; warning: NonNullable<ReturnType<typeof lodgingTax>['bracketEdgeWarning']> }>
}

export function computeLodging(config: TripConfig, priceData: PriceData, referenceDate: string): LodgingResult {
  const lineItems: LineItem[] = []
  const bracketEdgeWarnings: LodgingResult['bracketEdgeWarnings'] = []

  for (const leg of config.itinerary.legs) {
    const result = legLodgingCost(leg, config.party, priceData, referenceDate)
    lineItems.push(...result.lineItems)
    if (result.bracketEdgeWarning) {
      bracketEdgeWarnings.push({ cityId: leg.cityId, warning: result.bracketEdgeWarning })
    }
  }

  return { lineItems, totalJpy: sumLineItems(lineItems), bracketEdgeWarnings }
}
