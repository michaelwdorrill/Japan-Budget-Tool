import type { Leg, TripConfig } from './trip'
import type { PriceData } from './priceData'
import type { SeasonRecord } from './priceData'
import { multiplyByBasisRange, totalPeople } from './basis'
import { lodgingTax, type BracketEdgeWarning } from './tax'
import { findPrice } from './priceLookup'
import { findOverlappingSeasons, legNightDates, legStartDates } from './dateUtils'
import type { LineItem } from './lineItem'
import { sumLineItems } from './lineItem'

export interface LegLodgingResult {
  lineItems: LineItem[]
  bracketEdgeWarning: BracketEdgeWarning | null
  overlappingSeasons: SeasonRecord[]
}

function nightlyRatePerPerson(roomCostJpy: number, nights: number, people: number): number {
  return nights > 0 && people > 0 ? Math.round(roomCostJpy / (nights * people)) : 0
}

// Accommodation tax is a per-night, per-person statutory charge, and the
// applicable schedule is the one in force on *that night* — a stay that
// straddles an effective date pays the old rate before it and the new rate
// after. Freezing one reference date for the whole leg silently mispriced
// every trip crossing a rule change.
//
// Returns the tax summed across the leg's nights plus the first
// bracket-edge warning encountered, so the tax-cliff warning still surfaces.
function taxAcrossNights(
  priceData: PriceData,
  leg: Leg,
  legStartDate: string,
  nightlyRateJpy: number,
  people: number,
): { totalTaxJpy: number; bracketEdgeWarning: BracketEdgeWarning | null } {
  let totalTaxJpy = 0
  let bracketEdgeWarning: BracketEdgeWarning | null = null

  for (const nightDate of legNightDates(legStartDate, leg.nights)) {
    const result = lodgingTax(priceData.taxes, leg.cityId, nightlyRateJpy, 1, people, nightDate)
    totalTaxJpy += result.totalTaxJpy
    if (!bracketEdgeWarning && result.bracketEdgeWarning) bracketEdgeWarning = result.bracketEdgeWarning
  }

  return { totalTaxJpy, bracketEdgeWarning }
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
  legStartDate: string,
  legIndex: number,
): LegLodgingResult {
  const people = totalPeople(party)
  const record = findPrice(
    priceData.prices,
    (p) => p.category === 'lodging' && p.cityId === leg.cityId && p.tier === leg.lodgingTier,
    `lodging tier "${leg.lodgingTier}" in city "${leg.cityId}"`,
  )

  // The room rate is exactly what the price record says. A season window
  // overlapping this leg produces a warning (see findOverlappingSeasons),
  // never a multiplier: peak demand is a reason to re-quote a specific
  // night or book early, not a coefficient to apply to unrelated nights.
  // The previous behaviour repriced an entire leg when a single night
  // touched a peak window.
  const roomRange = multiplyByBasisRange(record.basis, record, { people, rooms: party.rooms, nights: leg.nights })
  const overlappingSeasons = findOverlappingSeasons(legStartDate, leg.nights, priceData.seasons)

  // The tax bracket a rate falls into can differ at the low/expected/high
  // room cost (this is exactly the bracket-cliff risk §3.2 warns about), so
  // each bound is computed at that bound's own nightly rate rather than
  // scaling a single expected-rate tax figure.
  const taxAtExpected = taxAcrossNights(
    priceData,
    leg,
    legStartDate,
    nightlyRatePerPerson(roomRange.amountJpy, leg.nights, people),
    people,
  )
  const taxLowJpy = taxAcrossNights(
    priceData,
    leg,
    legStartDate,
    nightlyRatePerPerson(roomRange.lowJpy, leg.nights, people),
    people,
  ).totalTaxJpy
  const taxHighJpy = taxAcrossNights(
    priceData,
    leg,
    legStartDate,
    nightlyRatePerPerson(roomRange.highJpy, leg.nights, people),
    people,
  ).totalTaxJpy

  // The leg index is part of every id: a trip that returns to a city it
  // already visited would otherwise emit duplicate line-item ids, breaking
  // React keys, CSV exports, and any reconciliation keyed by id.
  const lineItems: LineItem[] = [
    {
      id: `lodging-room-${legIndex}-${leg.cityId}-${record.id}`,
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
      id: `lodging-tax-${legIndex}-${leg.cityId}`,
      label: `Municipal accommodation tax, ${leg.cityId}`,
      category: 'lodging',
      subcategory: 'B2',
      cityId: leg.cityId,
      lowJpy: Math.min(taxLowJpy, taxHighJpy),
      amountJpy: taxAtExpected.totalTaxJpy,
      highJpy: Math.max(taxLowJpy, taxHighJpy),
      confidence: 'high',
      // A statutory charge. It varies with the room rate (hence the band),
      // but it must not be shocked by the shared lodging market factor in
      // the Monte Carlo roll-up: the tax schedule does not move when hotel
      // prices move.
      uncertainty: 'fixed',
    })
  }

  return { lineItems, bracketEdgeWarning: taxAtExpected.bracketEdgeWarning, overlappingSeasons }
}

export interface LodgingResult {
  lineItems: LineItem[]
  totalJpy: number
  bracketEdgeWarnings: Array<{ cityId: string; warning: BracketEdgeWarning }>
  seasonOverlaps: Array<{ cityId: string; legIndex: number; season: SeasonRecord }>
}

export function computeLodging(config: TripConfig, priceData: PriceData, referenceDate: string): LodgingResult {
  const lineItems: LineItem[] = []
  const bracketEdgeWarnings: LodgingResult['bracketEdgeWarnings'] = []
  const seasonOverlaps: LodgingResult['seasonOverlaps'] = []
  const starts = legStartDates(referenceDate, config.itinerary.legs)

  config.itinerary.legs.forEach((leg, index) => {
    const result = legLodgingCost(leg, config.party, priceData, starts[index], index)
    lineItems.push(...result.lineItems)
    if (result.bracketEdgeWarning) {
      bracketEdgeWarnings.push({ cityId: leg.cityId, warning: result.bracketEdgeWarning })
    }
    for (const season of result.overlappingSeasons) {
      seasonOverlaps.push({ cityId: leg.cityId, legIndex: index, season })
    }
  })

  return { lineItems, totalJpy: sumLineItems(lineItems), bracketEdgeWarnings, seasonOverlaps }
}
