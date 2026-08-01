import type { AirportId, CityId } from './ids'
import type { Category, PriceRecord } from './price'

// Plain-JSON mirrors of /data/*.json (§1: "the single source of truth for
// prices ... plain JSON with no TypeScript-specific structure"). These types
// describe the shape after JSON.parse, not the wire format.

export interface CityRecord {
  id: CityId
  name: string
  region: string
  airports: AirportId[]
  notes?: string
}

export type RailMode = 'shinkansen' | 'limited_express' | 'local' | 'bus' | 'flight'

export interface RailFareRecord {
  id: string
  fromCityId: CityId
  toCityId: CityId
  bidirectional: boolean
  mode: RailMode
  line: string
  durationMinutes: number
  fareJpyUnreserved: number
  fareJpyReserved: number
  fareJpyGreenCar?: number
  asOf: string
  source: string
  confidence: 'high' | 'medium' | 'low'
  notes?: string
}

export interface NationalPassRecord {
  id: string
  label: string
  days: number
  railClass: 'ordinary' | 'green'
  priceJpyOfficialChannel: number
  priceJpyOverseasAgent: number
  priceJpyOverseasAgentFrom?: { date: string; priceJpy: number }
  childDiscountPct: number
  nozomiMizuhoSupplementJpy: number
  asOf: string
  source: string
  confidence: 'high' | 'medium' | 'low'
  notes?: string
}

export interface RegionalPassRecord {
  id: string
  label: string
  operator: string
  coverage: CityId[]
  days: number
  priceJpy: number
  childDiscountPct: number
  asOf: string
  source: string
  confidence: 'high' | 'medium' | 'low'
  notes?: string
}

export interface DiscountProductRecord {
  id: string
  label: string
  route: string | null
  priceJpy: number
  notes?: string
  asOf: string
  source: string
  confidence: 'high' | 'medium' | 'low'
}

export interface PassesData {
  nationalPasses: NationalPassRecord[]
  regionalPasses: RegionalPassRecord[]
  discountProducts: DiscountProductRecord[]
}

export type TaxBracketStructure =
  | 'bracket_per_person_per_night'
  | 'flat_per_person_per_night'
  | 'percentage_per_person_per_night'

export interface TaxBracket {
  minJpy: number
  maxJpy: number | null
  taxJpy: number
}

export interface AccommodationTaxRecord {
  id: string
  cityId: CityId
  effectiveFrom: string
  effectiveTo: string | null
  structure: TaxBracketStructure
  brackets?: TaxBracket[]
  flatTaxJpy?: number
  percentageOfRate?: number
  bracketEdgeWarningThresholdPct?: number
  asOf: string
  source: string
  confidence: 'high' | 'medium' | 'low'
  notes?: string
}

export interface DepartureTaxRecord {
  id: string
  amountJpy: number
  basis: 'per_person_per_trip'
  collectedVia: string
  asOf: string
  source: string
  confidence: 'high' | 'medium' | 'low'
  notes?: string
}

export interface TaxesData {
  accommodationTax: AccommodationTaxRecord[]
  departureTax: DepartureTaxRecord
}

export interface NamedActivityRecord {
  id: string
  label: string
  cityId: CityId
  category: Category
  basis: 'per_person_per_use'
  low: number
  expected: number
  high: number
  durationMinutes: number
  advanceBookingLeadTime?: string
  asOf: string
  source: string
  confidence: 'high' | 'medium' | 'low'
  notes?: string
}

export interface ActivityFallbackRecord {
  id: string
  label: string
  tier: 'free_walking' | 'light' | 'standard' | 'premium'
  category: Category
  basis: 'per_person_per_day'
  low: number
  expected: number
  high: number
  asOf: string
  source: string
  confidence: 'high' | 'medium' | 'low'
  notes?: string
}

export interface ActivitiesData {
  namedActivities: NamedActivityRecord[]
  activityTierFallback: ActivityFallbackRecord[]
}

export interface SeasonRecord {
  id: string
  label: string
  startMonthDay: string
  endMonthDay: string
  severity: 'peak' | 'elevated' | 'sweet_spot'
  lodgingMultiplierLow: number
  lodgingMultiplierHigh: number
  advice: string
  asOf: string
  source: string
  confidence: 'high' | 'medium' | 'low'
  notes?: string
}

export interface PriceData {
  cities: CityRecord[]
  prices: PriceRecord[]
  railFares: RailFareRecord[]
  passes: PassesData
  taxes: TaxesData
  activities: ActivitiesData
  seasons: SeasonRecord[]
}
