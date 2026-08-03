import { addDaysToIsoDate, daysBetweenIsoDates } from './dateUtils'

// Turning a pair of home-side flight dates into the trip the engine prices.
//
// Two numbers come out of this, and they are deliberately different:
//
//   lodgingNights — what you pay for. Every night between landing in Japan
//                   and the morning you fly home.
//   usableDays    — what you can actually plan into. The arrival and
//                   departure days are real calendar days but not real
//                   sightseeing days: landing mid-afternoon leaves you an
//                   evening, and a morning flight home costs you the day.
//
// Conflating the two is how a "16-day trip" turns into fourteen-and-a-bit
// days of things you can actually do.

export type DayPart = 'morning' | 'midday' | 'afternoon' | 'evening'

// Fraction of a day still usable after landing at this time, allowing for
// immigration, baggage, and the train into the city.
const ARRIVAL_USABLE: Record<DayPart, number> = {
  morning: 0.75,
  midday: 0.6,
  afternoon: 0.4,
  evening: 0.15,
}

// Fraction of a day usable before a flight out at this time, allowing for
// getting to the airport and being there ahead of an international
// departure. A morning flight effectively costs the whole day.
const DEPARTURE_USABLE: Record<DayPart, number> = {
  morning: 0.05,
  midday: 0.25,
  afternoon: 0.45,
  evening: 0.7,
}

export interface TripWindowInput {
  departHomeDate: string
  arriveHomeDate: string
  // Calendar days consumed by each flight. Westbound across the date line
  // normally lands the *next* calendar day, so 1; eastbound normally lands
  // the same calendar day it departed, so 0.
  outboundTransitDays: number
  returnTransitDays: number
  arrivalPart: DayPart
  departurePart: DayPart
}

export interface TripWindow {
  japanArrivalDate: string
  japanDepartureDate: string
  lodgingNights: number
  // Whole days in Japan with no flight attached to them.
  fullDays: number
  // fullDays plus the usable fractions of the arrival and departure days,
  // rounded to one decimal — the honest "how much time do I actually have".
  usableDays: number
  arrivalUsableFraction: number
  departureUsableFraction: number
  valid: boolean
  problem: string | null
}

export function computeTripWindow(input: TripWindowInput): TripWindow {
  const { departHomeDate, arriveHomeDate, outboundTransitDays, returnTransitDays, arrivalPart, departurePart } = input

  const japanArrivalDate = addDaysToIsoDate(departHomeDate, outboundTransitDays)
  const japanDepartureDate = addDaysToIsoDate(arriveHomeDate, -returnTransitDays)
  const lodgingNights = daysBetweenIsoDates(japanArrivalDate, japanDepartureDate)

  const arrivalUsableFraction = ARRIVAL_USABLE[arrivalPart]
  const departureUsableFraction = DEPARTURE_USABLE[departurePart]

  if (lodgingNights < 1) {
    return {
      japanArrivalDate,
      japanDepartureDate,
      lodgingNights,
      fullDays: 0,
      usableDays: 0,
      arrivalUsableFraction,
      departureUsableFraction,
      valid: false,
      problem:
        lodgingNights < 0
          ? 'That return date is before the outbound flight lands in Japan.'
          : 'That window leaves no nights in Japan — check the dates or the transit-day assumptions.',
    }
  }

  // Arrival and departure days are the two ends of the stay; everything
  // strictly between them is a whole day on the ground.
  const fullDays = lodgingNights - 1
  const usableDays = Math.round((fullDays + arrivalUsableFraction + departureUsableFraction) * 10) / 10

  return {
    japanArrivalDate,
    japanDepartureDate,
    lodgingNights,
    fullDays,
    usableDays,
    arrivalUsableFraction,
    departureUsableFraction,
    valid: true,
    problem: null,
  }
}

// What a given calendar day is, for shading the calendar.
export type TripDayRole =
  | 'outside'
  | 'outbound_transit' // in the air / crossing the date line
  | 'arrival' // lands today, partial day
  | 'full' // a whole day on the ground
  | 'departure' // flies out today, partial day
  | 'return_transit' // still travelling home after leaving Japan

export function tripDayRole(date: string, window: TripWindow, departHomeDate: string, arriveHomeDate: string): TripDayRole {
  if (date < departHomeDate || date > arriveHomeDate) return 'outside'
  if (date < window.japanArrivalDate) return 'outbound_transit'
  if (date === window.japanArrivalDate) return 'arrival'
  if (date === window.japanDepartureDate) return 'departure'
  if (date > window.japanDepartureDate) return 'return_transit'
  return 'full'
}
