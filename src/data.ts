import type {
  ActivitiesData,
  CityRecord,
  PassesData,
  PriceData,
  RailFareRecord,
  SeasonRecord,
  TaxesData,
} from '../engine/priceData'
import type { PriceRecord } from '../engine/price'

import cities from '../data/cities.json'
import prices from '../data/prices.json'
import railFares from '../data/rail-fares.json'
import passes from '../data/passes.json'
import taxes from '../data/taxes.json'
import activities from '../data/activities.json'
import seasons from '../data/seasons.json'

// Bundled at build time (Vite JSON import) rather than fetched, matching
// §1's "no server, no API keys, no hosting cost" — the whole app, data
// included, is a static bundle.
export const priceData: PriceData = {
  cities: cities as CityRecord[],
  prices: prices as PriceRecord[],
  railFares: railFares as RailFareRecord[],
  passes: passes as PassesData,
  taxes: taxes as TaxesData,
  activities: activities as ActivitiesData,
  seasons: seasons as SeasonRecord[],
}
