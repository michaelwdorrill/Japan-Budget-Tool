import { describe, expect, it } from 'vitest'
import {
  addDaysToIsoDate,
  daysBetweenIsoDates,
  findOverlappingSeasons,
  legNightDates,
  legStartDates,
  resolveReferenceDate,
} from './dateUtils'
import { testPriceData } from './testFixtures/priceData'
import { baseTripConfig } from './testFixtures/tripConfig'
import type { Leg } from './trip'

describe('resolveReferenceDate', () => {
  it('prefers an exact start date when set', () => {
    const config = baseTripConfig({ timing: { startDate: '2027-01-15', season: null, nights: 3 } })
    const date = resolveReferenceDate(config, testPriceData.seasons, new Date('2026-06-01T00:00:00Z'))
    expect(date).toBe('2027-01-15')
  })

  it('falls back to a named season window in the future relative to now', () => {
    const config = baseTripConfig({ timing: { startDate: null, season: 'test_season', nights: 3 } })
    const date = resolveReferenceDate(config, testPriceData.seasons, new Date('2026-01-01T00:00:00Z'))
    expect(date).toBe('2026-03-20')
  })

  it('rolls the named season to next year when its window has already passed this year', () => {
    const config = baseTripConfig({ timing: { startDate: null, season: 'test_season', nights: 3 } })
    const date = resolveReferenceDate(config, testPriceData.seasons, new Date('2026-12-01T00:00:00Z'))
    expect(date).toBe('2027-03-20')
  })

  it('falls back to now when neither an exact date nor a season is set', () => {
    const now = new Date('2026-05-01T00:00:00Z')
    const config = baseTripConfig({ timing: { startDate: null, season: null, nights: 3 } })
    const date = resolveReferenceDate(config, testPriceData.seasons, now)
    expect(date).toBe('2026-05-01')
  })

  it('falls back to now when the named season id is not found', () => {
    const now = new Date('2026-05-01T00:00:00Z')
    const config = baseTripConfig({ timing: { startDate: null, season: 'not_a_real_season', nights: 3 } })
    const date = resolveReferenceDate(config, testPriceData.seasons, now)
    expect(date).toBe('2026-05-01')
  })
})

describe('addDaysToIsoDate', () => {
  it('adds days within a month', () => {
    expect(addDaysToIsoDate('2026-06-01', 5)).toBe('2026-06-06')
  })

  it('rolls over a month boundary', () => {
    expect(addDaysToIsoDate('2026-06-28', 5)).toBe('2026-07-03')
  })

  it('rolls over a year boundary', () => {
    expect(addDaysToIsoDate('2026-12-30', 5)).toBe('2027-01-04')
  })
})

describe('daysBetweenIsoDates', () => {
  it('counts whole days forward', () => {
    expect(daysBetweenIsoDates('2026-09-05', '2026-09-19')).toBe(14)
  })

  it('is negative when `to` precedes `from`', () => {
    expect(daysBetweenIsoDates('2026-09-19', '2026-09-05')).toBe(-14)
  })

  it('is zero for the same date', () => {
    expect(daysBetweenIsoDates('2026-09-05', '2026-09-05')).toBe(0)
  })

  it('crosses a month boundary correctly', () => {
    expect(daysBetweenIsoDates('2026-08-28', '2026-09-03')).toBe(6)
  })
})

describe('legStartDates', () => {
  function legWith(nights: number): Leg {
    return {
      cityId: 'tokyo',
      nights,
      lodgingTier: 'business',
      food: { breakfast: 'casual', lunch: 'casual', dinner: 'casual' },
      activities: [],
      activityTierFallback: 'light',
      dayTrips: [],
      splurgeMeals: 0,
    }
  }

  it('computes each leg start date as referenceDate + cumulative prior nights', () => {
    const legs = [legWith(3), legWith(2), legWith(4)]
    expect(legStartDates('2026-06-01', legs)).toEqual(['2026-06-01', '2026-06-04', '2026-06-06'])
  })

  it('returns an empty array for no legs', () => {
    expect(legStartDates('2026-06-01', [])).toEqual([])
  })
})

describe('legNightDates', () => {
  it('returns one date per night, starting at the leg start', () => {
    expect(legNightDates('2026-06-13', 3)).toEqual(['2026-06-13', '2026-06-14', '2026-06-15'])
  })

  it('returns an empty array for a zero-night waypoint leg', () => {
    expect(legNightDates('2026-06-13', 0)).toEqual([])
  })
})

describe('findOverlappingSeasons', () => {
  const peakSeason = {
    id: 'test_peak',
    label: 'Test Peak',
    startMonthDay: '03-20',
    endMonthDay: '04-10',
    severity: 'peak' as const,
    lodgingMultiplierLow: 1.4,
    lodgingMultiplierHigh: 2.2,
    advice: 'test',
    asOf: '2026-01-01',
    source: 'test',
    confidence: 'high' as const,
  }
  const goldenWeek = {
    id: 'test_golden_week',
    label: 'Test Golden Week',
    startMonthDay: '04-29',
    endMonthDay: '05-05',
    severity: 'peak' as const,
    lodgingMultiplierLow: 1.5,
    lodgingMultiplierHigh: 2.0,
    advice: 'test',
    asOf: '2026-01-01',
    source: 'test',
    confidence: 'high' as const,
  }
  const newYearSeason = {
    id: 'test_new_year',
    label: 'Test New Year',
    startMonthDay: '12-28',
    endMonthDay: '01-04',
    severity: 'peak' as const,
    lodgingMultiplierLow: 1.4,
    lodgingMultiplierHigh: 2.0,
    advice: 'test',
    asOf: '2026-01-01',
    source: 'test',
    confidence: 'high' as const,
  }
  const seasons = [peakSeason, goldenWeek, newYearSeason]

  it('finds a season overlapping the leg start date itself', () => {
    expect(findOverlappingSeasons('2026-03-25', 2, seasons).map((s) => s.id)).toEqual(['test_peak'])
  })

  it('finds a season overlapping a later night in the leg, not just the start', () => {
    // Starts 2 days before the window opens, but the 3-night stay reaches into it.
    expect(findOverlappingSeasons('2026-03-18', 3, seasons).map((s) => s.id)).toEqual(['test_peak'])
  })

  it('returns every distinct window a long leg touches, not just the first', () => {
    // 2026-04-08 + 30 nights runs through the tail of the peak window and
    // then into Golden Week. Reporting only the first would hide the second.
    expect(findOverlappingSeasons('2026-04-08', 30, seasons).map((s) => s.id)).toEqual(['test_peak', 'test_golden_week'])
  })

  it('returns an empty array when no night falls in any window', () => {
    expect(findOverlappingSeasons('2026-06-01', 3, seasons)).toEqual([])
  })

  it('handles a season window that wraps the calendar year boundary', () => {
    expect(findOverlappingSeasons('2026-12-30', 1, seasons).map((s) => s.id)).toEqual(['test_new_year'])
    expect(findOverlappingSeasons('2027-01-02', 1, seasons).map((s) => s.id)).toEqual(['test_new_year'])
  })

  it('treats a 0-night leg as a single-night check on its start date', () => {
    expect(findOverlappingSeasons('2026-03-25', 0, seasons).map((s) => s.id)).toEqual(['test_peak'])
    expect(findOverlappingSeasons('2026-06-01', 0, seasons)).toEqual([])
  })
})
