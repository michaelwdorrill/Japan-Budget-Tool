import type { TripConfig } from './trip'
import type { NationalPassRecord, PriceData, RailFareRecord, RegionalPassRecord } from './priceData'
import type { CityId } from './ids'
import { fareEquivalentPeople, multiplyByBasis } from './basis'
import type { LineItem } from './lineItem'
import { exactAmount, sumLineItems } from './lineItem'

// §4: the transport optimizer. Point-to-point fares are always the
// no-bulk-purchase baseline; national and regional passes are evaluated by
// sliding a `days`-long consecutive window across the trip and finding the
// placement that captures the most fare value, since a pass's price is
// fixed regardless of placement — only which journeys it covers varies.
//
// Not modeled (§4.2 items 5-6): domestic LCC fares and ANA/JAL
// foreign-visitor domestic fares. No flight price data has been seeded for
// either, so they're absent from the ranked list rather than silently
// priced at 0. C3 (seat/oversized-luggage reservations) and C5 (airport
// transfers) remain unpriced for the same reason as Phase 2.

export interface TransportOption {
  id: string
  label: string
  totalJpy: number
  savingsVsPointToPointJpy: number
  addedTravelTimeMinutes: number // relative to riding the fastest available train on every leg
  why: string
  lineItems: LineItem[]
}

interface Journey {
  fromCityId: CityId
  toCityId: CityId
  dayOffset: number // cumulative nights through the leg being departed; the day this journey happens
  record: RailFareRecord
  fareJpy: number // party-wide, fare-equivalent-people-weighted, at the requested rail class
}

function findRailFare(railFares: RailFareRecord[], fromCityId: CityId, toCityId: CityId): RailFareRecord {
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

function buildJourneys(config: TripConfig, priceData: PriceData): Journey[] {
  const legs = config.itinerary.legs
  const fareEqPeople = fareEquivalentPeople(config.party)
  const journeys: Journey[] = []

  let cumulativeNights = 0
  for (let i = 0; i < legs.length - 1; i++) {
    cumulativeNights += legs[i].nights
    const fromCityId = legs[i].cityId
    const toCityId = legs[i + 1].cityId
    if (fromCityId === toCityId) continue

    const record = findRailFare(priceData.railFares, fromCityId, toCityId)
    const unitFare = fareForClass(record, config.transport.railClass)
    journeys.push({
      fromCityId,
      toCityId,
      dayOffset: cumulativeNights,
      record,
      fareJpy: multiplyByBasis('per_person_per_leg', unitFare, { fareEquivalentPeople: fareEqPeople, legs: 1 }),
    })
  }

  return journeys
}

function journeyLineItem(journey: Journey, index: number, subcategory: string): LineItem {
  return {
    id: `transport-fare-${journey.record.id}-${index}`,
    label: `${journey.record.line}, ${journey.fromCityId} -> ${journey.toCityId}`,
    category: 'intercity_transport',
    subcategory,
    // Published rail fares have no low/high band in rail-fares.json — exact.
    ...exactAmount(journey.fareJpy),
    confidence: journey.record.confidence,
  }
}

// Tokaido/Sanyo Nozomi/Mizuho services aren't covered by the national JR
// Pass; riding them with a pass means paying the supplement (nozomiMizuhoSupplementJpy,
// not charged here) or taking a Hikari/Sakura instead, at a ~20-30 min
// penalty (§4.2). This flags journeys where that penalty applies by default.
function isNozomiMizuhoRoute(journey: Journey): boolean {
  return journey.record.mode === 'shinkansen' && /Tokaido|Sanyo/.test(journey.record.line)
}

const HIKARI_SAKURA_PENALTY_MINUTES = 25

function evaluatePointToPointOption(journeys: Journey[]): TransportOption {
  const lineItems = journeys.map((j, i) => journeyLineItem(j, i, 'C1'))
  const totalJpy = sumLineItems(lineItems)
  return {
    id: 'point_to_point',
    label: 'Point-to-point fares',
    totalJpy,
    savingsVsPointToPointJpy: 0,
    addedTravelTimeMinutes: 0,
    why: 'Pay each journey individually at the fastest available service; no pass to break even on.',
    lineItems,
  }
}

// Finds the `days`-long consecutive window (candidate start = some
// journey's day, the classic sliding-window argument) that captures the
// most fare value among `eligibleJourneys`. Returns the indices (into the
// full `journeys` array) that fall inside that window.
function bestWindowCapture(days: number, eligibleJourneys: Journey[]): Set<Journey> {
  if (eligibleJourneys.length === 0) return new Set()

  const candidateStarts = Array.from(new Set(eligibleJourneys.map((j) => j.dayOffset)))
  let bestValue = -1
  let bestSet = new Set<Journey>()

  for (const start of candidateStarts) {
    const end = start + days - 1
    const captured = new Set<Journey>()
    let value = 0
    for (const journey of eligibleJourneys) {
      if (journey.dayOffset >= start && journey.dayOffset <= end) {
        captured.add(journey)
        value += journey.fareJpy
      }
    }
    if (value > bestValue) {
      bestValue = value
      bestSet = captured
    }
  }

  return bestSet
}

function passPriceJpy(config: TripConfig, priceJpy: number, childDiscountPct: number): number {
  const fullFareChildren = config.party.children.filter((c) => c.age >= 12).length
  const halfFareChildren = config.party.children.filter((c) => c.age >= 6 && c.age <= 11).length
  // Children under 6 travel free and need no pass.
  const fullFareCount = config.party.adults + fullFareChildren
  return fullFareCount * priceJpy + halfFareChildren * Math.round(priceJpy * (childDiscountPct / 100))
}

function evaluatePassOption(
  config: TripConfig,
  journeys: Journey[],
  eligibleJourneys: Journey[],
  passId: string,
  label: string,
  days: number,
  priceJpy: number,
  childDiscountPct: number,
  confidence: 'high' | 'medium' | 'low',
): TransportOption {
  const captured = bestWindowCapture(days, eligibleJourneys)
  const pass = passPriceJpy(config, priceJpy, childDiscountPct)

  const lineItems: LineItem[] = [
    {
      id: `transport-pass-${passId}`,
      label,
      category: 'intercity_transport',
      subcategory: 'C1',
      // Pass prices have no low/high band in passes.json — exact.
      ...exactAmount(pass),
      confidence,
    },
  ]

  let paidFareJpy = 0
  journeys.forEach((journey, index) => {
    if (!captured.has(journey)) {
      paidFareJpy += journey.fareJpy
      lineItems.push(journeyLineItem(journey, index, 'C1'))
    }
  })

  const addedTravelTimeMinutes = Array.from(captured).reduce(
    (sum, j) => sum + (isNozomiMizuhoRoute(j) ? HIKARI_SAKURA_PENALTY_MINUTES : 0),
    0,
  )

  const capturedValueJpy = Array.from(captured).reduce((sum, j) => sum + j.fareJpy, 0)
  const totalJpy = pass + paidFareJpy
  const pointToPointTotalJpy = journeys.reduce((sum, j) => sum + j.fareJpy, 0)

  return {
    id: passId,
    label,
    totalJpy,
    savingsVsPointToPointJpy: pointToPointTotalJpy - totalJpy,
    addedTravelTimeMinutes,
    why:
      captured.size > 0
        ? `Captures ¥${capturedValueJpy.toLocaleString('en-US')} of fares within its ${days}-day window; pay point-to-point for the rest.` +
          (addedTravelTimeMinutes > 0 ? ` Assumes Hikari/Sakura instead of Nozomi/Mizuho to avoid the supplement (+${addedTravelTimeMinutes}min).` : '')
        : `No journey in this itinerary falls within reach of a single ${days}-day window; the pass buys nothing here.`,
    lineItems,
  }
}

function evaluateNationalPassOption(config: TripConfig, journeys: Journey[], pass: NationalPassRecord): TransportOption {
  return evaluatePassOption(
    config,
    journeys,
    journeys, // every journey is eligible for the national pass
    pass.id,
    pass.label,
    pass.days,
    pass.priceJpyOfficialChannel,
    pass.childDiscountPct,
    pass.confidence,
  )
}

function evaluateRegionalPassOption(config: TripConfig, journeys: Journey[], pass: RegionalPassRecord): TransportOption | null {
  const eligible = journeys.filter((j) => pass.coverage.includes(j.fromCityId) && pass.coverage.includes(j.toCityId))
  if (eligible.length === 0) return null // this pass's region doesn't touch this itinerary at all

  return evaluatePassOption(config, journeys, eligible, pass.id, pass.label, pass.days, pass.priceJpy, pass.childDiscountPct, pass.confidence)
}

// Discount products (Puratto Kodama, highway/overnight buses) are priced
// per specific route. Seishun 18 is deliberately excluded: it's local/rapid
// trains only, incompatible with the shinkansen-speed itineraries this
// optimizer is built around (see its `notes` in passes.json).
function discountProductTimePenaltyMinutes(label: string): number {
  if (/bus/i.test(label)) return 300 // overnight/highway bus vs. shinkansen: several hours slower
  if (/Kodama/i.test(label)) return 50 // all-stops Kodama vs. Nozomi/Hikari
  return 0
}

function evaluateDiscountProductsOption(config: TripConfig, priceData: PriceData, journeys: Journey[]): TransportOption | null {
  const fareEqPeople = fareEquivalentPeople(config.party)
  const lineItems: LineItem[] = []
  let totalJpy = 0
  let addedTravelTimeMinutes = 0
  let substitutions = 0

  journeys.forEach((journey, index) => {
    const routeId = `${journey.fromCityId}-${journey.toCityId}`
    const reverseRouteId = `${journey.toCityId}-${journey.fromCityId}`
    const product = priceData.passes.discountProducts.find((p) => p.route === routeId || p.route === reverseRouteId)

    if (product) {
      substitutions += 1
      const amountJpy = multiplyByBasis('per_person_per_leg', product.priceJpy, { fareEquivalentPeople: fareEqPeople, legs: 1 })
      totalJpy += amountJpy
      addedTravelTimeMinutes += discountProductTimePenaltyMinutes(product.label)
      lineItems.push({
        id: `transport-discount-${product.id}-${index}`,
        label: product.label,
        category: 'intercity_transport',
        subcategory: 'C1',
        // Discount product prices have no low/high band in passes.json — exact.
        ...exactAmount(amountJpy),
        confidence: product.confidence,
        notes: product.notes,
      })
    } else {
      totalJpy += journey.fareJpy
      lineItems.push(journeyLineItem(journey, index, 'C1'))
    }
  })

  if (substitutions === 0) return null // no discount product matches any journey in this itinerary

  const pointToPointTotalJpy = journeys.reduce((sum, j) => sum + j.fareJpy, 0)
  return {
    id: 'discount_products',
    label: 'Point-to-point with discount product substitutions',
    totalJpy,
    savingsVsPointToPointJpy: pointToPointTotalJpy - totalJpy,
    addedTravelTimeMinutes,
    why: `Swaps ${substitutions} journey(s) for a matching discounted product (e.g. Puratto Kodama, highway bus).`,
    lineItems,
  }
}

export interface TransportOptimizerResult {
  options: TransportOption[] // sorted ascending by totalJpy; show the top three (§4.2)
}

export function optimizeTransport(config: TripConfig, priceData: PriceData): TransportOptimizerResult {
  const journeys = buildJourneys(config, priceData)

  if (journeys.length === 0) {
    return { options: [evaluatePointToPointOption(journeys)] }
  }

  const options: TransportOption[] = [evaluatePointToPointOption(journeys)]

  for (const pass of priceData.passes.nationalPasses) {
    if (pass.railClass !== config.transport.railClass) continue
    options.push(evaluateNationalPassOption(config, journeys, pass))
  }

  for (const pass of priceData.passes.regionalPasses) {
    const option = evaluateRegionalPassOption(config, journeys, pass)
    if (option) options.push(option)
  }

  const discountOption = evaluateDiscountProductsOption(config, priceData, journeys)
  if (discountOption) options.push(discountOption)

  options.sort((a, b) => a.totalJpy - b.totalJpy)
  return { options }
}

export function findTransportOption(config: TripConfig, priceData: PriceData, optionId: string): TransportOption {
  const { options } = optimizeTransport(config, priceData)
  const match = options.find((o) => o.id === optionId)
  if (!match) {
    throw new Error(`unknown transport strategy/pass id "${optionId}"`)
  }
  return match
}
