import type { TripConfig } from '../trip'

// A minimal, valid 2-adult, 1-leg TripConfig. Individual tests override
// only the fields relevant to what they're checking.
export function baseTripConfig(overrides: Partial<TripConfig> = {}): TripConfig {
  const config: TripConfig = {
    party: {
      adults: 2,
      children: [],
      rooms: 1,
    },
    timing: {
      startDate: '2026-06-01',
      season: null,
      nights: 3,
    },
    itinerary: {
      arrivalAirport: 'NRT',
      departureAirport: 'NRT',
      legs: [
        {
          cityId: 'tokyo',
          nights: 3,
          lodgingTier: 'business',
          food: { breakfast: 'casual', lunch: 'casual', dinner: 'casual' },
          activities: [],
          activityTierFallback: 'light',
          dayTrips: [],
          splurgeMeals: 0,
        },
      ],
    },
    flight: {
      mode: 'exclude',
      taxesAndFeesUsd: 0,
    },
    money: {
      jpyPerUsd: 150,
      fxStressPct: 10,
      cardFxFeePct: 0,
      cashJpyPerPersonPerDay: 3000,
      contingencyPct: 10,
    },
    transport: {
      strategy: 'point_to_point',
      railClass: 'ordinary',
      luggageForwarding: false,
    },
  }

  return { ...config, ...overrides }
}
