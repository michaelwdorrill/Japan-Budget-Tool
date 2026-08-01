import type { TripConfig } from '../../engine/trip'

// §5.3: "a user who answers nothing should still get a plausible number."
// This is the seed every wizard session (and every skipped step) falls
// back to.
export function defaultTripConfig(): TripConfig {
  return {
    party: { adults: 2, children: [], rooms: 1 },
    timing: { startDate: null, season: null, nights: 5 },
    itinerary: {
      arrivalAirport: 'NRT',
      departureAirport: 'NRT',
      legs: [
        {
          cityId: 'tokyo',
          nights: 5,
          lodgingTier: 'business',
          food: { breakfast: 'casual', lunch: 'casual', dinner: 'standard' },
          activities: [],
          activityTierFallback: 'light',
          dayTrips: [],
          splurgeMeals: 0,
        },
      ],
    },
    flight: { mode: 'exclude', taxesAndFeesUsd: 0 },
    money: {
      jpyPerUsd: 150,
      fxStressPct: 10,
      cardFxFeePct: 0,
      cashJpyPerPersonPerDay: 3000,
      contingencyPct: 10,
    },
    transport: { strategy: 'auto', railClass: 'ordinary', luggageForwarding: false },
  }
}

export const GOLDEN_ROUTE_PRESET: TripConfig = {
  party: { adults: 2, children: [], rooms: 1 },
  timing: { startDate: null, season: null, nights: 10 },
  itinerary: {
    arrivalAirport: 'NRT',
    departureAirport: 'KIX',
    legs: [
      {
        cityId: 'tokyo',
        nights: 4,
        lodgingTier: 'midrange',
        food: { breakfast: 'casual', lunch: 'casual', dinner: 'standard' },
        activities: [],
        activityTierFallback: 'light',
        dayTrips: [],
        splurgeMeals: 0,
      },
      {
        cityId: 'kyoto',
        nights: 3,
        lodgingTier: 'midrange',
        food: { breakfast: 'casual', lunch: 'standard', dinner: 'standard' },
        activities: [],
        activityTierFallback: 'light',
        dayTrips: [],
        splurgeMeals: 1,
      },
      {
        cityId: 'osaka',
        nights: 3,
        lodgingTier: 'business',
        food: { breakfast: 'konbini', lunch: 'casual', dinner: 'casual' },
        activities: [],
        activityTierFallback: 'light',
        dayTrips: [],
        splurgeMeals: 0,
      },
    ],
  },
  flight: { mode: 'exclude', taxesAndFeesUsd: 0 },
  money: { jpyPerUsd: 150, fxStressPct: 10, cardFxFeePct: 0, cashJpyPerPersonPerDay: 3500, contingencyPct: 10 },
  transport: { strategy: 'auto', railClass: 'ordinary', luggageForwarding: false },
}

export const KANSAI_DEEP_DIVE_PRESET: TripConfig = {
  party: { adults: 2, children: [], rooms: 1 },
  timing: { startDate: null, season: null, nights: 8 },
  itinerary: {
    arrivalAirport: 'KIX',
    departureAirport: 'KIX',
    legs: [
      {
        cityId: 'osaka',
        nights: 3,
        lodgingTier: 'business',
        food: { breakfast: 'konbini', lunch: 'casual', dinner: 'casual' },
        activities: [],
        activityTierFallback: 'standard',
        dayTrips: [],
        splurgeMeals: 0,
      },
      {
        cityId: 'kyoto',
        nights: 4,
        lodgingTier: 'midrange',
        food: { breakfast: 'casual', lunch: 'standard', dinner: 'nice' },
        activities: [],
        activityTierFallback: 'light',
        dayTrips: [],
        splurgeMeals: 1,
      },
      {
        cityId: 'nara',
        nights: 1,
        lodgingTier: 'midrange',
        food: { breakfast: 'casual', lunch: 'casual', dinner: 'casual' },
        activities: [],
        activityTierFallback: 'free_walking',
        dayTrips: [],
        splurgeMeals: 0,
      },
    ],
  },
  flight: { mode: 'exclude', taxesAndFeesUsd: 0 },
  money: { jpyPerUsd: 150, fxStressPct: 10, cardFxFeePct: 0, cashJpyPerPersonPerDay: 3000, contingencyPct: 10 },
  transport: { strategy: 'auto', railClass: 'ordinary', luggageForwarding: false },
}

export const TOKYO_HAKONE_KYOTO_PRESET: TripConfig = {
  party: { adults: 2, children: [], rooms: 1 },
  timing: { startDate: null, season: null, nights: 9 },
  itinerary: {
    arrivalAirport: 'NRT',
    departureAirport: 'KIX',
    legs: [
      {
        cityId: 'tokyo',
        nights: 3,
        lodgingTier: 'midrange',
        food: { breakfast: 'casual', lunch: 'casual', dinner: 'standard' },
        activities: [],
        activityTierFallback: 'light',
        dayTrips: [],
        splurgeMeals: 0,
      },
      {
        cityId: 'hakone',
        nights: 2,
        lodgingTier: 'ryokan_hanmeshi',
        food: { breakfast: 'casual', lunch: 'casual', dinner: 'casual' },
        activities: [],
        activityTierFallback: 'standard',
        dayTrips: [],
        splurgeMeals: 0,
      },
      {
        cityId: 'kyoto',
        nights: 4,
        lodgingTier: 'midrange',
        food: { breakfast: 'casual', lunch: 'standard', dinner: 'standard' },
        activities: [],
        activityTierFallback: 'light',
        dayTrips: [],
        splurgeMeals: 1,
      },
    ],
  },
  flight: { mode: 'exclude', taxesAndFeesUsd: 0 },
  money: { jpyPerUsd: 150, fxStressPct: 10, cardFxFeePct: 0, cashJpyPerPersonPerDay: 3500, contingencyPct: 10 },
  transport: { strategy: 'auto', railClass: 'ordinary', luggageForwarding: false },
}

export const PRESETS: { id: string; label: string; config: TripConfig }[] = [
  { id: 'golden_route', label: 'Golden Route, 10 nights', config: GOLDEN_ROUTE_PRESET },
  { id: 'kansai_deep_dive', label: 'Kansai deep dive, 8 nights', config: KANSAI_DEEP_DIVE_PRESET },
  { id: 'tokyo_hakone_kyoto', label: 'Tokyo + Hakone + Kyoto, 9 nights', config: TOKYO_HAKONE_KYOTO_PRESET },
]
