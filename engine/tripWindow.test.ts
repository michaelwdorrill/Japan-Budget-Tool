import { describe, expect, it } from 'vitest'
import { computeTripWindow, tripDayRole, type TripWindowInput } from './tripWindow'

// The real trip this was built for: fly out of DC on Friday 2027-09-03,
// land back home Sunday 2027-09-19. Westbound loses a calendar day to the
// date line; eastbound gains it back.
const dcTrip: TripWindowInput = {
  departHomeDate: '2027-09-03',
  arriveHomeDate: '2027-09-19',
  outboundTransitDays: 1,
  returnTransitDays: 0,
  arrivalPart: 'afternoon',
  departurePart: 'morning',
}

describe('computeTripWindow', () => {
  it('derives the Japan-side window from the two home-side flight dates', () => {
    const w = computeTripWindow(dcTrip)
    expect(w.japanArrivalDate).toBe('2027-09-04')
    expect(w.japanDepartureDate).toBe('2027-09-19')
    expect(w.valid).toBe(true)
  })

  it('counts every night between landing and flying home as a lodging night', () => {
    // 2027-09-04 through 2027-09-18 inclusive = 15 nights.
    expect(computeTripWindow(dcTrip).lodgingNights).toBe(15)
  })

  it('separates whole days on the ground from the two travel days', () => {
    const w = computeTripWindow(dcTrip)
    // 09-05 .. 09-18 are untouched by a flight.
    expect(w.fullDays).toBe(14)
  })

  it('reports usable days below the night count, because arrival and departure days are partial', () => {
    const w = computeTripWindow(dcTrip)
    // 14 full + 0.4 (mid-afternoon landing) + 0.05 (morning flight home).
    expect(w.usableDays).toBe(14.5)
    expect(w.usableDays).toBeLessThan(w.lodgingNights)
  })

  it('gives back most of the arrival day for a morning landing', () => {
    const w = computeTripWindow({ ...dcTrip, arrivalPart: 'morning' })
    expect(w.usableDays).toBe(14.8)
  })

  it('gives back most of the departure day for an evening flight home', () => {
    const w = computeTripWindow({ ...dcTrip, departurePart: 'evening' })
    expect(w.usableDays).toBe(15.1)
  })

  it('treats a same-day outbound (no date-line loss) as landing the day you leave', () => {
    const w = computeTripWindow({ ...dcTrip, outboundTransitDays: 0 })
    expect(w.japanArrivalDate).toBe('2027-09-03')
    expect(w.lodgingNights).toBe(16)
  })

  it('rejects a window that leaves no nights in Japan', () => {
    const w = computeTripWindow({ ...dcTrip, arriveHomeDate: '2027-09-04' })
    expect(w.valid).toBe(false)
    expect(w.problem).toMatch(/no nights/i)
  })

  it('rejects a return that precedes the outbound landing', () => {
    const w = computeTripWindow({ ...dcTrip, arriveHomeDate: '2027-09-01' })
    expect(w.valid).toBe(false)
    expect(w.problem).toMatch(/before the outbound/i)
  })
})

describe('tripDayRole', () => {
  const w = computeTripWindow(dcTrip)
  const role = (d: string) => tripDayRole(d, w, dcTrip.departHomeDate, dcTrip.arriveHomeDate)

  it.each([
    ['2027-09-02', 'outside'],
    ['2027-09-03', 'outbound_transit'],
    ['2027-09-04', 'arrival'],
    ['2027-09-05', 'full'],
    ['2027-09-18', 'full'],
    ['2027-09-19', 'departure'],
    ['2027-09-20', 'outside'],
  ])('classifies %s as %s', (date, expected) => {
    expect(role(date)).toBe(expected)
  })

  it('marks days still in transit home when the return flight spans a date change', () => {
    const slow = { ...dcTrip, returnTransitDays: 1 }
    const sw = computeTripWindow(slow)
    expect(tripDayRole('2027-09-19', sw, slow.departHomeDate, slow.arriveHomeDate)).toBe('return_transit')
    expect(sw.japanDepartureDate).toBe('2027-09-18')
  })
})
