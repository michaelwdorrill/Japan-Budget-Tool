import type { AirportId, CityId, DayTripId, ExplicitPassId, SeasonId } from './ids'
import type { Tier } from './price'

// §2.3 — lodging tier for a leg. Same taxonomy as PriceRecord.tier.
export type LodgingTier = Tier

// §2.3 — three independent meal-slot dials, deliberately not one "niceness" slider.
export type FoodTier = 'konbini' | 'casual' | 'standard' | 'nice' | 'splurge'

// §2.3 — fallback for days without an explicit activity plan.
export type ActivityTier = 'free_walking' | 'light' | 'standard' | 'premium'

export interface ActivitySelection {
  activityId: string
  quantity: number
}

// §2.2
export interface TripConfig {
  party: {
    adults: number
    children: { age: number }[] // JR fares half price 6–11, free under 6
    rooms: number // default ceil(people / 2), user-overridable
  }

  timing: {
    startDate: string | null // exact date if known
    season: SeasonId | null // else pick a season window
    nights: number // total; must equal sum of leg nights
  }

  itinerary: {
    arrivalAirport: AirportId
    departureAirport: AirportId // open-jaw supported and encouraged
    legs: Leg[]
  }

  flight: {
    mode: 'points' | 'cash' | 'exclude'
    cashEstimateUsd?: number
    taxesAndFeesUsd: number // ALWAYS charged, even on award tickets
    pointsUsed?: number // display-only opportunity cost
    centsPerPoint?: number // display-only
  }

  money: {
    // §7: "home-currency support: the FX layer already handles this; add a
    // currency picker and the display layer follows" — jpyPerUsd is really
    // "JPY per unit of home currency" once currencyCode is anything other
    // than USD; the field name is legacy from the single-currency v1 and
    // kept as-is rather than renamed, to avoid breaking existing shared
    // URLs/fixtures. currencyCode is display-only: it never changes the
    // JPY math, only which symbol/label the UI formats amounts with.
    jpyPerUsd: number
    fxStressPct: number // ± band, default 10
    cardFxFeePct: number // 0 for a no-FX-fee card, else 3
    cashJpyPerPersonPerDay: number // how much they'll pull from ATMs
    contingencyPct: number // default 10, applied to variable costs only
    currencyCode?: string // ISO 4217, e.g. 'USD', 'EUR'; defaults to 'USD' when unset
  }

  transport: {
    strategy: 'auto' | 'point_to_point' | ExplicitPassId
    railClass: 'ordinary' | 'green'
    luggageForwarding: boolean
  }

  // §3.1 H2 — not enumerated in §2.2's TripConfig, added here so the
  // "default 0 with a nudge" personal shopping line has an input to read.
  shopping?: {
    personalBudgetJpy?: number
  }

  preset?: 'lean' | 'comfortable' | 'splurge' // seeds all tiers at once
}

export interface Leg {
  cityId: CityId
  nights: number
  lodgingTier: LodgingTier
  food: {
    breakfast: FoodTier
    lunch: FoodTier
    dinner: FoodTier
  }
  activities: ActivitySelection[] // named picks with real prices
  activityTierFallback: ActivityTier // for unplanned days
  dayTrips: DayTripId[]
  splurgeMeals: number // count of high-end dinners on this leg
}
