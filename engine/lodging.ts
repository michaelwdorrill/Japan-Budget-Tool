import type { Leg, TripConfig } from './trip'
import type { PriceData } from './priceData'
import { multiplyByBasisRange, totalPeople } from './basis'
import { lodgingTax } from './tax'
import { findPrice } from './priceLookup'
import type { LineItem } from './lineItem'
import { sumLineItems } from './lineItem'

export interface LegLodgingResult {
  lineItems: LineItem[]
  bracketEdgeWarning: ReturnType<typeof lodgingTax>['bracketEdgeWarning']
}

function nightlyRatePerPerson(roomCostJpy: number, nights: number, people: number): number {
  return nights > 0 && people > 0 ? Math.round(roomCostJpy / (nights * people)) : 0
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

  const roomRange = multiplyByBasisRange(record.basis, record, { people, rooms: party.rooms, nights: leg.nights })

  // The tax bracket a rate falls into can differ at the low/expected/high
  // room cost (this is exactly the bracket-cliff risk §3.2 warns about), so
  // each bound is computed by re-running lodgingTax at that bound's own
  // nightly rate rather than scaling a single expected-rate tax figure.
  const taxAtExpected = lodgingTax(
    priceData.taxes,
    leg.cityId,
    nightlyRatePerPerson(roomRange.amountJpy, leg.nights, people),
    leg.nights,
    people,
    referenceDate,
  )
  const taxLowJpy = lodgingTax(
    priceData.taxes,
    leg.cityId,
    nightlyRatePerPerson(roomRange.lowJpy, leg.nights, people),
    leg.nights,
    people,
    referenceDate,
  ).totalTaxJpy
  const taxHighJpy = lodgingTax(
    priceData.taxes,
    leg.cityId,
    nightlyRatePerPerson(roomRange.highJpy, leg.nights, people),
    leg.nights,
    people,
    referenceDate,
  ).totalTaxJpy

  const lineItems: LineItem[] = [
    {
      id: `lodging-room-${leg.cityId}-${record.id}`,
      label: record.label,
      category: 'lodging',
      subcategory: 'B1',
      cityId: leg.cityId,
      ...roomRange,
      confidence: record.confidence,
    },
  ]

  if (taxAtExpected.totalTaxJpy > 0 || taxLowJpy > 0 || taxHighJpy > 0) {
    lineItems.push({
      id: `lodging-tax-${leg.cityId}`,
      label: `Municipal accommodation tax, ${leg.cityId}`,
      category: 'lodging',
      subcategory: 'B2',
      cityId: leg.cityId,
      lowJpy: Math.min(taxLowJpy, taxHighJpy),
      amountJpy: taxAtExpected.totalTaxJpy,
      highJpy: Math.max(taxLowJpy, taxHighJpy),
      confidence: 'medium',
    })
  }

  return { lineItems, bracketEdgeWarning: taxAtExpected.bracketEdgeWarning }
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
