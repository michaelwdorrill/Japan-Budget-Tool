import type { Leg, TripConfig } from './trip'
import type { PriceData, SeasonRecord } from './priceData'
import type { BudgetResult } from './budget'
import { MEALS_INCLUDED_TIERS } from './food'
import { multiplyByBasisRange, totalPeople } from './basis'
import { findPriceById } from './priceLookup'
import { runMonteCarlo } from './monteCarlo'
import { jpyToUsd } from './money'

// §5.2: a declarative rule table, deliberately not embedded in UI
// components. Each rule inspects the already-computed budget/config and
// returns zero or more messages; a rule "applies" exactly when it returns
// a non-empty array, which is what the Phase 7 gate's triggering/
// non-triggering fixtures exercise.

export type GuidanceCategory = 'lodging' | 'transport' | 'activities' | 'money' | 'logistics' | 'documents'

export interface GuidanceMessage {
  ruleId: string
  category: GuidanceCategory
  severity: 'info' | 'warning'
  message: string
  costDeltaJpy?: number
}

export interface GuidanceContext {
  config: TripConfig
  priceData: PriceData
  budget: BudgetResult
}

export interface GuidanceOptions {
  // The season-shift counterfactual runs two 10,000-trial Monte Carlo
  // simulations; skip it for callers (e.g. fast unit tests of the other
  // 15 rules) that don't need it. Defaults on for real use (CLI, UI).
  includeSeasonShiftCounterfactual?: boolean
}

type GuidanceRule = (ctx: GuidanceContext) => GuidanceMessage[]

function formatJpy(amountJpy: number): string {
  return `¥${Math.round(amountJpy).toLocaleString('en-US')}`
}

const bracketEdgeWarningRule: GuidanceRule = (ctx) =>
  ctx.budget.bracketEdgeWarnings.map(({ cityId, warning }) => ({
    ruleId: 'bracket-edge-warning',
    category: 'lodging',
    severity: 'warning',
    message: `${cityId}: this lodging rate sits within the warning threshold of a ${formatJpy(warning.edgeJpy)}/person/night tax bracket edge — crossing it adds ${formatJpy(warning.taxDeltaJpyPerPersonPerNight)}/person/night. A small rate change (currently ${formatJpy(warning.distanceJpy)} away) can jump the tax band.`,
  }))

const ryokanMealsConfirmationRule: GuidanceRule = (ctx) =>
  ctx.config.itinerary.legs
    .filter((leg) => MEALS_INCLUDED_TIERS.includes(leg.lodgingTier))
    .map((leg) => ({
      ruleId: 'ryokan-meals-confirmation',
      category: 'lodging' as const,
      severity: 'info' as const,
      message: `${leg.cityId}: this leg's lodging rate already includes dinner and breakfast, so those meal slots are zeroed for its ${leg.nights} night(s) — confirm that's right for your plan.`,
    }))

function legHasOnsen(leg: Leg, priceData: PriceData): boolean {
  if (leg.lodgingTier === 'ryokan_hanmeshi') return true
  const activityIds = new Set(priceData.activities.namedActivities.filter((a) => a.id.toLowerCase().includes('onsen')).map((a) => a.id))
  if (leg.activities.some((selection) => activityIds.has(selection.activityId))) return true
  return leg.dayTrips.some((id) => id.toLowerCase().includes('onsen'))
}

const onsenTattooPolicyRule: GuidanceRule = (ctx) =>
  ctx.config.itinerary.legs
    .filter((leg) => legHasOnsen(leg, ctx.priceData))
    .map((leg) => ({
      ruleId: 'onsen-tattoo-policy',
      category: 'activities' as const,
      severity: 'info' as const,
      message: `${leg.cityId}: tattoo policies at onsen and ryokan baths vary widely — some ban visible tattoos, some offer cover stickers or private baths. Check the specific property before booking.`,
    }))

const luggageForwardingSuggestionRule: GuidanceRule = (ctx) => {
  const transfers = Math.max(0, ctx.config.itinerary.legs.length - 1)
  if (transfers < 3 || ctx.config.transport.luggageForwarding) return []

  const record = findPriceById(ctx.priceData.prices, 'luggage_forwarding_per_bag_per_transfer')
  const people = totalPeople(ctx.config.party)
  const range = multiplyByBasisRange(record.basis, record, { fareEquivalentPeople: people, legs: transfers })

  return [
    {
      ruleId: 'luggage-forwarding-suggestion',
      category: 'transport',
      severity: 'info',
      message: `Your itinerary has ${transfers} city changes — forwarding luggage ahead (takkyubin) instead of hauling it through stations would cost about ${formatJpy(range.amountJpy)} for the trip.`,
      costDeltaJpy: range.amountJpy,
    },
  ]
}

const advanceBookingLeadTimeRule: GuidanceRule = (ctx) => {
  const messages: GuidanceMessage[] = []
  for (const leg of ctx.config.itinerary.legs) {
    for (const selection of leg.activities) {
      const activity = ctx.priceData.activities.namedActivities.find((a) => a.id === selection.activityId)
      if (activity?.advanceBookingLeadTime) {
        messages.push({
          ruleId: 'advance-booking-lead-time',
          category: 'activities',
          severity: 'info',
          message: `${activity.label} (${leg.cityId}): ${activity.advanceBookingLeadTime}`,
        })
      }
    }
  }
  return messages
}

const laundryNoteRule: GuidanceRule = (ctx) => {
  if (ctx.config.timing.nights <= 10) return []
  const record = findPriceById(ctx.priceData.prices, 'laundry')
  const people = totalPeople(ctx.config.party)
  const range = multiplyByBasisRange(record.basis, record, { people })
  return [
    {
      ruleId: 'laundry-note',
      category: 'logistics',
      severity: 'info',
      message: `A ${ctx.config.timing.nights}-night trip usually means at least one laundry run (coin laundry or a hotel service) — budget about ${formatJpy(range.amountJpy)}, or pack lighter and plan around it.`,
      costDeltaJpy: range.amountJpy,
    },
  ]
}

const tokyoDayTripBaseNoteRule: GuidanceRule = (ctx) =>
  ctx.config.itinerary.legs
    .filter((leg) => leg.cityId === 'tokyo' && leg.nights > 5 && leg.dayTrips.length > 0)
    .map((leg) => ({
      ruleId: 'tokyo-day-trip-base-note',
      category: 'lodging' as const,
      severity: 'info' as const,
      message: `${leg.nights} nights based in Tokyo with day trips planned — compare staying put and day-tripping against relocating for a night or two; relocating adds packing/transit overhead but can cut backtracking.`,
    }))

const KYOTO_OSAKA_COMPARABLE_TIERS = ['business', 'midrange', 'upscale', 'luxury', 'ryokan_hanmeshi'] as const

const kyotoOsakaBaseDeltaRule: GuidanceRule = (ctx) =>
  ctx.config.itinerary.legs
    .filter((leg) => leg.cityId === 'kyoto' && (KYOTO_OSAKA_COMPARABLE_TIERS as readonly string[]).includes(leg.lodgingTier))
    .flatMap((leg) => {
      const kyotoRecord = ctx.priceData.prices.find((p) => p.category === 'lodging' && p.cityId === 'kyoto' && p.tier === leg.lodgingTier)
      const osakaRecord = ctx.priceData.prices.find((p) => p.category === 'lodging' && p.cityId === 'osaka' && p.tier === leg.lodgingTier)
      if (!kyotoRecord || !osakaRecord) return []

      const people = totalPeople(ctx.config.party)
      const kyotoCost = multiplyByBasisRange(kyotoRecord.basis, kyotoRecord, { people, rooms: ctx.config.party.rooms, nights: leg.nights })
      const osakaCost = multiplyByBasisRange(osakaRecord.basis, osakaRecord, { people, rooms: ctx.config.party.rooms, nights: leg.nights })
      const deltaJpy = kyotoCost.amountJpy - osakaCost.amountJpy
      if (deltaJpy <= 0) return []

      return [
        {
          ruleId: 'kyoto-osaka-base-delta',
          category: 'lodging' as const,
          severity: 'info' as const,
          message: `Kyoto ${leg.lodgingTier} lodging for ${leg.nights} night(s) runs about ${formatJpy(deltaJpy)} more than the same tier in Osaka — basing in Osaka with Kyoto day trips (roughly 30 min each way by rail) would save that, at the cost of the daily commute.`,
          costDeltaJpy: deltaJpy,
        },
      ]
    })

const cashAtmsRule: GuidanceRule = () => [
  {
    ruleId: 'cash-atms',
    category: 'money',
    severity: 'info',
    message: 'Japan is increasingly cashless, but temples, small restaurants, and rural areas are often cash-only. 7-Eleven and Japan Post ATMs reliably accept foreign cards.',
  },
]

const taxFreeShoppingRule: GuidanceRule = () => [
  {
    ruleId: 'tax-free-shopping',
    category: 'money',
    severity: 'info',
    message: 'Purchases of ¥5,000 or more at registered tax-free stores can skip consumption tax at checkout — bring your passport.',
  },
]

const consumptionTaxRule: GuidanceRule = () => [
  {
    ruleId: 'consumption-tax-included',
    category: 'money',
    severity: 'info',
    message: "Japan's 10% consumption tax is normally included in displayed prices already — don't add it again on top of a posted price.",
  },
]

const cardFxFeeCostRule: GuidanceRule = (ctx) => {
  const feePct = ctx.config.money.cardFxFeePct
  if (feePct <= 0) return []
  const feeJpy = Math.round(ctx.budget.variableCostsJpy * (feePct / 100))
  const feeUsd = jpyToUsd(feeJpy, ctx.config.money.jpyPerUsd)
  return [
    {
      ruleId: 'card-fx-fee-cost',
      category: 'money',
      severity: 'info',
      message: `Your card's ${feePct}% foreign-transaction fee costs roughly ${formatJpy(feeJpy)} (about $${feeUsd.toFixed(0)}) on this trip's variable spend — a no-FX-fee card would save that.`,
      costDeltaJpy: feeJpy,
    },
  ]
}

const usPassportEntryRule: GuidanceRule = () => [
  {
    ruleId: 'us-passport-entry',
    category: 'documents',
    severity: 'info',
    message: 'US passport holders currently need no visa for stays up to 90 days, but confirm current entry requirements before departure — a pre-travel electronic authorization system has been under discussion.',
  },
]

const passportInsuranceMedsRule: GuidanceRule = () => [
  {
    ruleId: 'passport-insurance-meds',
    category: 'documents',
    severity: 'info',
    message: 'Check passport validity (6+ months is a common airline requirement), arrange travel insurance, and check prescription medication rules — some common US medications (certain stimulants and codeine-containing drugs) are restricted or banned in Japan.',
  },
]

const childrenFareOccupancyRule: GuidanceRule = (ctx) => {
  if (ctx.config.party.children.length === 0) return []
  return [
    {
      ruleId: 'children-fare-occupancy',
      category: 'money',
      severity: 'info',
      message: 'Rail fares are free under 6 and half price 6-11, but lodging occupancy limits in Japan are strict — confirm each room actually allows your party size before booking.',
    },
  ]
}

// Static, always-evaluated rules (§5.2). Order matches roughly the order
// they'd be useful to a planner: money/logistics warnings first, then
// always-on notes, then documents.
const STATIC_RULES: GuidanceRule[] = [
  bracketEdgeWarningRule,
  ryokanMealsConfirmationRule,
  onsenTattooPolicyRule,
  luggageForwardingSuggestionRule,
  advanceBookingLeadTimeRule,
  laundryNoteRule,
  tokyoDayTripBaseNoteRule,
  kyotoOsakaBaseDeltaRule,
  cashAtmsRule,
  taxFreeShoppingRule,
  consumptionTaxRule,
  cardFxFeeCostRule,
  usPassportEntryRule,
  passportInsuranceMedsRule,
  childrenFareOccupancyRule,
]

const NON_LEAP_YEAR_CUMULATIVE_DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]

function dayOfYear(monthDay: string): number {
  const [month, day] = monthDay.split('-').map(Number)
  return NON_LEAP_YEAR_CUMULATIVE_DAYS[month - 1] + day
}

function circularDayDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 365
  return Math.min(diff, 365 - diff)
}

function nearestSweetSpotSeason(seasons: SeasonRecord[], fromMonthDay: string): SeasonRecord | null {
  const sweetSpots = seasons.filter((s) => s.severity === 'sweet_spot')
  if (sweetSpots.length === 0) return null
  const fromDay = dayOfYear(fromMonthDay)
  return sweetSpots.reduce((closest, candidate) =>
    circularDayDistance(fromDay, dayOfYear(candidate.startMonthDay)) < circularDayDistance(fromDay, dayOfYear(closest.startMonthDay))
      ? candidate
      : closest,
  )
}

// §5.1: shifts a config's start date to the nearest shoulder ("sweet_spot")
// season relative to `fromMonthDay`, keeping the reference date's year.
// Returns null when there's no sweet_spot season in the data at all.
// Exported so the "what if" panel (§6) can preview the same shift the
// season-shift-counterfactual guidance rule quantifies, without
// duplicating the nearest-season search.
export function shiftToNearestShoulderSeason(config: TripConfig, priceData: PriceData, fromMonthDay: string, referenceDate: string): TripConfig | null {
  const target = nearestSweetSpotSeason(priceData.seasons, fromMonthDay)
  if (!target) return null

  const referenceYear = referenceDate.slice(0, 4)
  const shiftedStartDate = `${referenceYear}-${target.startMonthDay}`

  return {
    ...config,
    timing: { ...config.timing, startDate: shiftedStartDate, season: null },
  }
}

// §5.1: for a trip that overlaps a peak/elevated season, quantify what
// shifting to the nearest shoulder ("sweet_spot") season would save at the
// P80 level — the single most actionable piece of guidance the tool can
// give, since seasonal lodging multipliers are 1.4x-2.2x.
function seasonShiftCounterfactualRule(ctx: GuidanceContext): GuidanceMessage[] {
  if (ctx.budget.seasonOverlaps.length === 0) return []

  const overlap = ctx.budget.seasonOverlaps[0]
  const shiftedConfig = shiftToNearestShoulderSeason(ctx.config, ctx.priceData, overlap.season.startMonthDay, ctx.budget.referenceDate)
  if (!shiftedConfig) return []
  const target = nearestSweetSpotSeason(ctx.priceData.seasons, overlap.season.startMonthDay)!

  const baseline = runMonteCarlo(ctx.config, ctx.priceData, { seed: 1 })
  const shifted = runMonteCarlo(shiftedConfig, ctx.priceData, { seed: 1 })
  const deltaJpy = baseline.jpyParty.p80 - shifted.jpyParty.p80
  if (deltaJpy <= 0) return []

  const deltaUsd = jpyToUsd(deltaJpy, ctx.config.money.jpyPerUsd, { cardFxFeePct: ctx.config.money.cardFxFeePct })

  return [
    {
      ruleId: 'season-shift-counterfactual',
      category: 'lodging',
      severity: 'info',
      message: `This trip overlaps ${overlap.season.label} pricing. Shifting toward ${target.label} (starting around ${target.startMonthDay}) would cut the P80 estimate by about ${formatJpy(deltaJpy)} (~$${deltaUsd.toFixed(0)}).`,
      costDeltaJpy: deltaJpy,
    },
  ]
}

export function computeGuidance(config: TripConfig, priceData: PriceData, budget: BudgetResult, options: GuidanceOptions = {}): GuidanceMessage[] {
  const ctx: GuidanceContext = { config, priceData, budget }
  const includeSeasonShift = options.includeSeasonShiftCounterfactual ?? true

  const rules = includeSeasonShift ? [...STATIC_RULES, seasonShiftCounterfactualRule] : STATIC_RULES
  return rules.flatMap((rule) => rule(ctx))
}
