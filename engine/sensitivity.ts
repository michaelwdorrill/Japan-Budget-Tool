import type { FoodTier, Leg, TripConfig } from './trip'
import type { PriceData } from './priceData'
import type { Tier } from './price'
import type { ActivityTier } from './trip'
import { computeBudget } from './budget'
import { totalPeople } from './basis'
import { jpyToUsd } from './money'

// §3.4: for each input, recompute the total with it moved one notch up and
// one notch down, holding everything else fixed. Cheap and high-value —
// this ordering *is* the product's advice on which decisions matter.

export interface SensitivityFactor {
  id: string
  label: string
  baselineJpyPerPerson: number
  lowJpyPerPerson: number
  highJpyPerPerson: number
  impactJpyPerPerson: number // abs(high - low), JPY ledger view

  // The same comparison measured in the traveller's home currency, which
  // is the unit the headline is displayed in. This is the tornado chart's
  // sort key: measured in JPY, moving the FX rate is mechanically zero
  // impact, so the chart used to tell the user FX does not matter while
  // the displayed budget visibly moved.
  baselineHomePerPerson: number
  lowHomePerPerson: number
  highHomePerPerson: number
  impactHomePerPerson: number
}

const LODGING_TIER_LADDER: Tier[] = ['hostel', 'business', 'midrange', 'upscale', 'luxury']
const FOOD_TIER_LADDER: FoodTier[] = ['konbini', 'casual', 'standard', 'nice', 'splurge']
const ACTIVITY_TIER_LADDER: ActivityTier[] = ['free_walking', 'light', 'standard', 'premium']
// Meals-included tiers (ryokan_hanmeshi, mountain_hut) aren't on the
// niceness ladder and zero out dinner — keep food.ts's MEALS_INCLUDED_TIERS in sync.
const MEALS_INCLUDED_TIERS: Tier[] = ['ryokan_hanmeshi', 'mountain_hut']

function cloneConfig(config: TripConfig): TripConfig {
  return structuredClone(config)
}

// Shifts `current` by `delta` steps along `ladder`, restricted to whichever
// ladder entries are actually available (e.g. a city with no luxury tier
// priced) — falls back to the nearest available step rather than throwing.
function shiftWithinAvailable<T>(ladder: T[], current: T, delta: number, available: T[]): T {
  const usable = ladder.filter((t) => available.includes(t))
  if (usable.length === 0) return current
  const currentIndex = usable.indexOf(current)
  const baseIndex = currentIndex >= 0 ? currentIndex : 0
  const nextIndex = Math.min(usable.length - 1, Math.max(0, baseIndex + delta))
  return usable[nextIndex]
}

function availableLodgingTiers(cityId: string, priceData: PriceData): Tier[] {
  return priceData.prices.filter((p) => p.category === 'lodging' && p.cityId === cityId).map((p) => p.tier as Tier)
}

function availableFoodTiers(slot: 'breakfast' | 'lunch' | 'dinner', priceData: PriceData): FoodTier[] {
  return FOOD_TIER_LADDER.filter((tier) => priceData.prices.some((p) => p.id === `food_${slot}_${tier}`))
}

function legWithMostNights(legs: Leg[]): number {
  let maxIndex = 0
  for (let i = 1; i < legs.length; i++) {
    if (legs[i].nights > legs[maxIndex].nights) maxIndex = i
  }
  return maxIndex
}

// Exported for the "what if" panel (§6), which previews the same one-notch
// shifts this module uses to measure impact.
export function shiftNights(config: TripConfig, delta: number): TripConfig {
  const next = cloneConfig(config)
  const index = legWithMostNights(next.itinerary.legs)
  next.itinerary.legs[index].nights = Math.max(0, next.itinerary.legs[index].nights + delta)
  next.timing.nights = next.itinerary.legs.reduce((sum, leg) => sum + leg.nights, 0)
  return next
}

// Exported for the "what if" panel (§6): "one tier down on lodging."
export function shiftLodgingTier(config: TripConfig, delta: number, priceData: PriceData): TripConfig {
  const next = cloneConfig(config)
  for (const leg of next.itinerary.legs) {
    if (MEALS_INCLUDED_TIERS.includes(leg.lodgingTier)) continue // not on the niceness ladder
    leg.lodgingTier = shiftWithinAvailable(LODGING_TIER_LADDER, leg.lodgingTier, delta, availableLodgingTiers(leg.cityId, priceData))
  }
  return next
}

function shiftPartySize(config: TripConfig, delta: number): TripConfig {
  const next = cloneConfig(config)
  next.party.adults = Math.max(1, next.party.adults + delta)
  return next
}

function shiftDinnerTier(config: TripConfig, delta: number, priceData: PriceData): TripConfig {
  const next = cloneConfig(config)
  const available = availableFoodTiers('dinner', priceData)
  for (const leg of next.itinerary.legs) {
    if (MEALS_INCLUDED_TIERS.includes(leg.lodgingTier)) continue // dinner is zeroed for this leg regardless
    leg.food.dinner = shiftWithinAvailable(FOOD_TIER_LADDER, leg.food.dinner, delta, available)
  }
  return next
}

function shiftSplurgeMeals(config: TripConfig, delta: number): TripConfig {
  const next = cloneConfig(config)
  const index = legWithMostNights(next.itinerary.legs)
  next.itinerary.legs[index].splurgeMeals = Math.max(0, next.itinerary.legs[index].splurgeMeals + delta)
  return next
}

function shiftFxRate(config: TripConfig, delta: number): TripConfig {
  const next = cloneConfig(config)
  const band = next.money.jpyPerUsd * (next.money.fxStressPct / 100)
  next.money.jpyPerUsd = Math.max(1, next.money.jpyPerUsd + delta * band)
  return next
}

function shiftActivityTier(config: TripConfig, delta: number): TripConfig {
  const next = cloneConfig(config)
  for (const leg of next.itinerary.legs) {
    leg.activityTierFallback = shiftWithinAvailable(ACTIVITY_TIER_LADDER, leg.activityTierFallback, delta, ACTIVITY_TIER_LADDER)
  }
  return next
}

interface PerPersonTotals {
  jpy: number
  home: number
}

// Both units for one config. The home-currency figure keeps purchases
// already fixed in the home currency out of the FX conversion, matching
// how the headline and the Monte Carlo roll-up present the total, and uses
// *this* config's own FX rate so shifting the rate is a real movement.
function totalsPerPerson(config: TripConfig, priceData: PriceData): PerPersonTotals {
  const budget = computeBudget(config, priceData)
  const people = totalPeople(config.party)
  const divisor = people > 0 ? people : 1

  const home =
    budget.fixedHomeCurrencyParty / divisor +
    jpyToUsd(budget.jpyLedgerParty / divisor, config.money.jpyPerUsd, { cardFxFeePct: config.money.cardFxFeePct })

  return { jpy: budget.totalJpyPerPerson, home }
}

// Expected rough ordering per §3.4: nights -> lodging tier -> party size ->
// dinner tier -> splurge meal count -> FX rate -> intercity strategy ->
// activities. computeSensitivity doesn't hardcode that order — it measures
// each factor's actual impact on this trip and sorts descending, so the
// ordering is real data, not a fixed script.
export function computeSensitivity(config: TripConfig, priceData: PriceData): SensitivityFactor[] {
  const baseline = totalsPerPerson(config, priceData)

  const factors: Array<{ id: string; label: string; a: TripConfig; b: TripConfig }> = [
    { id: 'nights', label: 'Trip length (nights)', a: shiftNights(config, -1), b: shiftNights(config, 1) },
    { id: 'lodging_tier', label: 'Lodging tier', a: shiftLodgingTier(config, -1, priceData), b: shiftLodgingTier(config, 1, priceData) },
    { id: 'party_size', label: 'Party size (adults)', a: shiftPartySize(config, -1), b: shiftPartySize(config, 1) },
    { id: 'dinner_tier', label: 'Dinner tier', a: shiftDinnerTier(config, -1, priceData), b: shiftDinnerTier(config, 1, priceData) },
    { id: 'splurge_meals', label: 'Splurge meal count', a: shiftSplurgeMeals(config, -1), b: shiftSplurgeMeals(config, 1) },
    { id: 'fx_rate', label: 'FX rate', a: shiftFxRate(config, -1), b: shiftFxRate(config, 1) },
    {
      id: 'intercity_strategy',
      label: 'Intercity transport strategy',
      a: { ...cloneConfig(config), transport: { ...config.transport, strategy: 'point_to_point' } },
      b: { ...cloneConfig(config), transport: { ...config.transport, strategy: 'auto' } },
    },
    { id: 'activities', label: 'Activity fallback tier', a: shiftActivityTier(config, -1), b: shiftActivityTier(config, 1) },
  ]

  const results = factors.map(({ id, label, a, b }) => {
    const totalA = totalsPerPerson(a, priceData)
    const totalB = totalsPerPerson(b, priceData)
    const lowJpyPerPerson = Math.min(totalA.jpy, totalB.jpy)
    const highJpyPerPerson = Math.max(totalA.jpy, totalB.jpy)
    const lowHomePerPerson = Math.min(totalA.home, totalB.home)
    const highHomePerPerson = Math.max(totalA.home, totalB.home)
    return {
      id,
      label,
      baselineJpyPerPerson: baseline.jpy,
      lowJpyPerPerson,
      highJpyPerPerson,
      impactJpyPerPerson: highJpyPerPerson - lowJpyPerPerson,
      baselineHomePerPerson: baseline.home,
      lowHomePerPerson,
      highHomePerPerson,
      impactHomePerPerson: highHomePerPerson - lowHomePerPerson,
    }
  })

  // Sorted by home-currency impact: the unit the headline is shown in.
  return results.sort((x, y) => y.impactHomePerPerson - x.impactHomePerPerson)
}
