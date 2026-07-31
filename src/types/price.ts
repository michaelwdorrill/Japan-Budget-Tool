import type { CityId } from './ids'

// §2.1 — the core abstraction. The engine's multiplication step is a single
// switch on `basis`. Never multiply anywhere else.
export type CostBasis =
  | 'per_room_per_night' // business hotels, Western hotels, Airbnb
  | 'per_person_per_night' // ryokan with meals, hostel beds, lodging tax
  | 'per_person_per_day' // food, local transit, incidentals
  | 'per_person_per_leg' // intercity rail/air fares
  | 'per_person_per_trip' // flights, JR Pass, departure tax, insurance, eSIM
  | 'per_party_per_trip' // pocket wifi, one shared rental car, one guide
  | 'per_person_per_use' // a single named activity or splurge meal

export type Category =
  | 'getting_there'
  | 'lodging'
  | 'intercity_transport'
  | 'local_transport'
  | 'food'
  | 'activities'
  | 'connectivity'
  | 'shopping'
  | 'reserves'

// §2.3 lodging tiers, incl. the ryokan_hanmeshi special case.
export type Tier =
  | 'hostel'
  | 'business'
  | 'midrange'
  | 'upscale'
  | 'luxury'
  | 'ryokan_hanmeshi'

export interface PriceRecord {
  id: string
  label: string
  cityId?: CityId
  category: Category
  tier?: Tier
  basis: CostBasis
  low: number // JPY, integer
  expected: number // JPY, integer
  high: number // JPY, integer
  asOf: string // ISO date — when this price was last verified
  source: string // URL or citation
  confidence: 'high' | 'medium' | 'low'
  notes?: string
}
