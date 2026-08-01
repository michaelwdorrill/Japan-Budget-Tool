import { describe, expect, it } from 'vitest'
import { addDaysToIsoDate, findOverlappingSeason, legStartDates, resolveReferenceDate } from './dateUtils'
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

describe('findOverlappingSeason', () => {
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
  const seasons = [peakSeason, newYearSeason]

  it('finds a season overlapping the leg start date itself', () => {
    expect(findOverlappingSeason('2026-03-25', 2, seasons)?.id).toBe('test_peak')
  })

  it('finds a season overlapping a later night in the leg, not just the start', () => {
    // Starts 2 days before the window opens, but the 2-night stay reaches into it.
    expect(findOverlappingSeason('2026-03-18', 3, seasons)?.id).toBe('test_peak')
  })

  it('returns null when no night in the leg falls in any season window', () => {
    expect(findOverlappingSeason('2026-06-01', 3, seasons)).toBeNull()
  })

  it('handles a season window that wraps the calendar year boundary', () => {
    expect(findOverlappingSeason('2026-12-30', 1, seasons)?.id).toBe('test_new_year')
    expect(findOverlappingSeason('2027-01-02', 1, seasons)?.id).toBe('test_new_year')
  })

  it('treats a 0-night leg as a single-night check on its start date', () => {
    expect(findOverlappingSeason('2026-03-25', 0, seasons)?.id).toBe('test_peak')
    expect(findOverlappingSeason('2026-06-01', 0, seasons)).toBeNull()
  })
})
