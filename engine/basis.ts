import type { CostBasis } from './price'
import type { TripConfig } from './trip'

// The engine's multiplication step is a single switch on `basis` (§2.1).
// Never multiply a PriceRecord's value anywhere else.

export interface BasisQuantities {
  people?: number // total headcount (adults + children), full fare
  fareEquivalentPeople?: number // headcount weighted by child fare rules (free <6, half 6-11)
  rooms?: number
  nights?: number
  days?: number
  legs?: number
  uses?: number
}

function requireQuantity(basis: CostBasis, quantities: BasisQuantities, key: keyof BasisQuantities): number {
  const value = quantities[key]
  if (value === undefined) {
    throw new Error(`basis "${basis}" requires quantity "${key}"`)
  }
  return value
}

export function multiplyByBasis(basis: CostBasis, unitPriceJpy: number, quantities: BasisQuantities): number {
  switch (basis) {
    case 'per_room_per_night':
      return unitPriceJpy * requireQuantity(basis, quantities, 'rooms') * requireQuantity(basis, quantities, 'nights')
    case 'per_person_per_night':
      return unitPriceJpy * requireQuantity(basis, quantities, 'people') * requireQuantity(basis, quantities, 'nights')
    case 'per_person_per_day':
      return unitPriceJpy * requireQuantity(basis, quantities, 'people') * requireQuantity(basis, quantities, 'days')
    case 'per_person_per_leg':
      return (
        unitPriceJpy * requireQuantity(basis, quantities, 'fareEquivalentPeople') * requireQuantity(basis, quantities, 'legs')
      )
    case 'per_person_per_trip':
      return unitPriceJpy * requireQuantity(basis, quantities, 'people')
    case 'per_party_per_trip':
      return unitPriceJpy
    case 'per_person_per_use':
      return unitPriceJpy * requireQuantity(basis, quantities, 'people') * requireQuantity(basis, quantities, 'uses')
  }
}

// Party-size helpers shared by every category module.

export function totalPeople(party: TripConfig['party']): number {
  return party.adults + party.children.length
}

// JR-style fare fraction: free under 6, half price 6-11, full fare otherwise.
export function childFareFraction(age: number): number {
  if (age < 6) return 0
  if (age <= 11) return 0.5
  return 1
}

export function fareEquivalentPeople(party: TripConfig['party']): number {
  const childrenFare = party.children.reduce((sum, child) => sum + childFareFraction(child.age), 0)
  return party.adults + childrenFare
}
