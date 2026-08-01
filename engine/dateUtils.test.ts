import { describe, expect, it } from 'vitest'
import { resolveReferenceDate } from './dateUtils'
import { testPriceData } from './testFixtures/priceData'
import { baseTripConfig } from './testFixtures/tripConfig'

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
