import { describe, expect, it } from 'vitest'
import { childFareFraction, fareEquivalentPeople, multiplyByBasis, totalPeople } from './basis'
import type { TripConfig } from './trip'

describe('multiplyByBasis', () => {
  it('per_room_per_night multiplies by rooms and nights', () => {
    expect(multiplyByBasis('per_room_per_night', 10000, { rooms: 2, nights: 3 })).toBe(60000)
  })

  it('per_person_per_night multiplies by people and nights', () => {
    expect(multiplyByBasis('per_person_per_night', 20000, { people: 2, nights: 3 })).toBe(120000)
  })

  it('per_person_per_day multiplies by people and days', () => {
    expect(multiplyByBasis('per_person_per_day', 1000, { people: 2, days: 4 })).toBe(8000)
  })

  it('per_person_per_leg multiplies by fareEquivalentPeople and legs', () => {
    expect(multiplyByBasis('per_person_per_leg', 14000, { fareEquivalentPeople: 2.5, legs: 1 })).toBe(35000)
  })

  it('per_person_per_trip multiplies by people only', () => {
    expect(multiplyByBasis('per_person_per_trip', 8000, { people: 3 })).toBe(24000)
  })

  it('per_party_per_trip returns the unit price unmultiplied', () => {
    expect(multiplyByBasis('per_party_per_trip', 8500, {})).toBe(8500)
  })

  it('per_person_per_use multiplies by people and uses', () => {
    expect(multiplyByBasis('per_person_per_use', 30000, { people: 2, uses: 2 })).toBe(120000)
  })

  it('throws when a required quantity is missing', () => {
    expect(() => multiplyByBasis('per_room_per_night', 10000, { rooms: 2 })).toThrow(/nights/)
    expect(() => multiplyByBasis('per_person_per_night', 10000, { nights: 2 })).toThrow(/people/)
    expect(() => multiplyByBasis('per_person_per_day', 10000, { people: 2 })).toThrow(/days/)
    expect(() => multiplyByBasis('per_person_per_leg', 10000, { legs: 1 })).toThrow(/fareEquivalentPeople/)
    expect(() => multiplyByBasis('per_person_per_trip', 10000, {})).toThrow(/people/)
    expect(() => multiplyByBasis('per_person_per_use', 10000, { people: 2 })).toThrow(/uses/)
  })
})

describe('childFareFraction', () => {
  it('is free under 6', () => {
    expect(childFareFraction(0)).toBe(0)
    expect(childFareFraction(5)).toBe(0)
  })

  it('is half price 6-11', () => {
    expect(childFareFraction(6)).toBe(0.5)
    expect(childFareFraction(11)).toBe(0.5)
  })

  it('is full fare 12+', () => {
    expect(childFareFraction(12)).toBe(1)
    expect(childFareFraction(40)).toBe(1)
  })
})

describe('totalPeople / fareEquivalentPeople', () => {
  const party: TripConfig['party'] = { adults: 2, children: [{ age: 8 }, { age: 3 }], rooms: 1 }

  it('totalPeople counts every party member', () => {
    expect(totalPeople(party)).toBe(4)
  })

  it('fareEquivalentPeople weights children by fare fraction', () => {
    expect(fareEquivalentPeople(party)).toBe(2.5)
  })
})
