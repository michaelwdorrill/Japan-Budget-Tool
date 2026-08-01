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

// A leg "overlaps" a season if any night it's actually in-country falls
// inside that season's window (checking only the start date would miss a
// leg that begins just before, say, Golden Week and runs into it).
export function findOverlappingSeason(legStartDate: string, nights: number, seasons: SeasonRecord[]): SeasonRecord | null {
  const nightsToCheck = Math.max(nights, 1)
  for (let i = 0; i < nightsToCheck; i++) {
    const monthDay = monthDayOf(addDaysToIsoDate(legStartDate, i))
    const match = seasons.find((s) => isMonthDayInWindow(monthDay, s.startMonthDay, s.endMonthDay))
    if (match) return match
  }
  return null
}
