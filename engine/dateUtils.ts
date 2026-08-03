import type { Leg, TripConfig } from './trip'
import type { SeasonRecord } from './priceData'

// Picks a single ISO date to evaluate date-scoped rules against (dated tax
// brackets, seasonal multipliers). Exact date wins; a named season falls
// back to that season's window start in the nearest occurrence of `now` or
// later; with neither, `now` itself is the best available guess.
export function resolveReferenceDate(config: TripConfig, seasons: SeasonRecord[], now: Date): string {
  if (config.timing.startDate) return config.timing.startDate

  const season = config.timing.season ? seasons.find((s) => s.id === config.timing.season) : undefined
  if (season) {
    const year = now.getUTCFullYear()
    const candidate = `${year}-${season.startMonthDay}`
    return candidate >= now.toISOString().slice(0, 10) ? candidate : `${year + 1}-${season.startMonthDay}`
  }

  return now.toISOString().slice(0, 10)
}

export function addDaysToIsoDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

// Whole days from `fromIsoDate` to `toIsoDate` (negative if `to` precedes
// `from`). Used by the wizard's calendar-mode "When" step to turn a
// depart/return date pair into a nights count.
export function daysBetweenIsoDates(fromIsoDate: string, toIsoDate: string): number {
  const from = new Date(`${fromIsoDate}T00:00:00Z`).getTime()
  const to = new Date(`${toIsoDate}T00:00:00Z`).getTime()
  return Math.round((to - from) / (24 * 60 * 60 * 1000))
}

// The start date of each leg, computed as referenceDate + the cumulative
// nights of every leg before it.
export function legStartDates(referenceDate: string, legs: Leg[]): string[] {
  const starts: string[] = []
  let cumulativeNights = 0
  for (const leg of legs) {
    starts.push(addDaysToIsoDate(referenceDate, cumulativeNights))
    cumulativeNights += leg.nights
  }
  return starts
}

function monthDayOf(isoDate: string): string {
  return isoDate.slice(5, 10) // "MM-DD"
}

function isMonthDayInWindow(monthDay: string, startMonthDay: string, endMonthDay: string): boolean {
  if (startMonthDay <= endMonthDay) {
    return monthDay >= startMonthDay && monthDay <= endMonthDay
  }
  // Wraps the calendar year boundary (e.g. New Year: 12-28 to 01-04).
  return monthDay >= startMonthDay || monthDay <= endMonthDay
}

// The dates of each night in a leg, so callers can evaluate a per-night
// rule (an accommodation-tax schedule, a seasonal warning) on the night it
// actually applies to instead of freezing one date for the whole stay.
export function legNightDates(legStartDate: string, nights: number): string[] {
  return Array.from({ length: Math.max(nights, 0) }, (_, i) => addDaysToIsoDate(legStartDate, i))
}

// Every distinct season any night of the leg falls into. A leg can touch
// more than one window (a stay spanning late April runs through both the
// tail of cherry blossom and the start of Golden Week), and reporting only
// the first would hide the second from the guidance layer.
//
// This drives *warnings only*. Seasons deliberately do not multiply a room
// rate: peak demand is a reason to re-quote a specific night's hotel or to
// book early, not a coefficient to apply to unrelated nights.
export function findOverlappingSeasons(legStartDate: string, nights: number, seasons: SeasonRecord[]): SeasonRecord[] {
  const found: SeasonRecord[] = []
  for (const date of legNightDates(legStartDate, Math.max(nights, 1))) {
    const monthDay = monthDayOf(date)
    for (const season of seasons) {
      if (isMonthDayInWindow(monthDay, season.startMonthDay, season.endMonthDay) && !found.includes(season)) {
        found.push(season)
      }
    }
  }
  return found
}
