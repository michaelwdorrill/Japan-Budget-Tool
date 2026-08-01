import { readFileSync } from 'node:fs'
import path from 'node:path'
import type {
  ActivitiesData,
  CityRecord,
  PassesData,
  PriceData,
  RailFareRecord,
  SeasonRecord,
  TaxesData,
} from './priceData'
import type { PriceRecord } from './price'

function readJson<T>(dataDir: string, fileName: string): T {
  return JSON.parse(readFileSync(path.join(dataDir, fileName), 'utf-8')) as T
}

// Node-only loader (fs access), kept out of the pure engine modules so the
// rest of engine/ has no I/O and can be reused by non-Node consumers later.
export function loadPriceData(dataDir: string): PriceData {
  return {
    cities: readJson<CityRecord[]>(dataDir, 'cities.json'),
    prices: readJson<PriceRecord[]>(dataDir, 'prices.json'),
    railFares: readJson<RailFareRecord[]>(dataDir, 'rail-fares.json'),
    passes: readJson<PassesData>(dataDir, 'passes.json'),
    taxes: readJson<TaxesData>(dataDir, 'taxes.json'),
    activities: readJson<ActivitiesData>(dataDir, 'activities.json'),
    seasons: readJson<SeasonRecord[]>(dataDir, 'seasons.json'),
  }
}
