import type { TripConfig } from './trip'
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
