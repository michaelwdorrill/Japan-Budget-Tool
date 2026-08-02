import { describe, expect, it } from 'vitest'
import { computeAdditiveEnvelope, runMonteCarlo } from './monteCarlo'
import { computeBudget } from './budget'
import { testPriceData } from './testFixtures/priceData'
import { baseTripConfig } from './testFixtures/tripConfig'
import type { Leg } from './trip'

function legWith(overrides: Partial<Leg>): Leg {
  return {
    cityId: 'tokyo',
    nights: 3,
    lodgingTier: 'business',
    food: { breakfast: 'casual', lunch: 'casual', dinner: 'casual' },
    activities: [],
    activityTierFallback: 'light',
    dayTrips: [],
    splurgeMeals: 1,
    ...overrides,
  }
}

function multiLegConfig() {
  return baseTripConfig({
    party: { adults: 2, children: [], rooms: 1 },
    timing: { startDate: '2026-06-01', season: null, nights: 6 },
    itinerary: {
      arrivalAirport: 'NRT',
      departureAirport: 'NRT',
      legs: [legWith({ cityId: 'tokyo', nights: 3 }), legWith({ cityId: 'kyoto', nights: 3 })],
    },
    flight: { mode: 'cash', cashEstimateUsd: 900, taxesAndFeesUsd: 100 },
  })
}

describe('runMonteCarlo — reproducibility (§9 Phase 6 gate)', () => {
  it('produces identical results for two runs with the same seed', () => {
    const config = multiLegConfig()
    const a = runMonteCarlo(config, testPriceData, { seed: 42, trials: 2000 })
    const b = runMonteCarlo(config, testPriceData, { seed: 42, trials: 2000 })
    expect(a).toEqual(b)
  })

  it('produces different results for two runs with different seeds', () => {
    const config = multiLegConfig()
    const a = runMonteCarlo(config, testPriceData, { seed: 1, trials: 2000 })
    const b = runMonteCarlo(config, testPriceData, { seed: 2, trials: 2000 })
    expect(a.jpyParty).not.toEqual(b.jpyParty)
  })
})

describe('runMonteCarlo — correlation (§9 Phase 6 gate, §3.3 regression test)', () => {
  it('produces a visibly wider P10-P90 band with correlated market factors than with independent draws', () => {
    const config = multiLegConfig()
    const correlated = runMonteCarlo(config, testPriceData, { seed: 7, trials: 8000, correlated: true })
    const independent = runMonteCarlo(config, testPriceData, { seed: 7, trials: 8000, correlated: false })

    const correlatedBand = correlated.jpyParty.p90 - correlated.jpyParty.p10
    const independentBand = independent.jpyParty.p90 - independent.jpyParty.p10

    // "Visibly wider" — require a clear margin, not just numerically greater,
    // so this stays a meaningful regression test rather than noise-sensitive.
    expect(correlatedBand).toBeGreaterThan(independentBand * 1.15)
  })
})

describe('runMonteCarlo — sanity', () => {
  it('centers roughly on the deterministic expected-value total', () => {
    const config = multiLegConfig()
    const deterministic = computeBudget(config, testPriceData)
    const result = runMonteCarlo(config, testPriceData, { seed: 3, trials: 8000 })

    // P50 should land within a reasonable band of the deterministic total —
    // PERT is asymmetric-tolerant but centers near the mode/expected value.
    expect(result.jpyParty.p50).toBeGreaterThan(deterministic.totalJpyParty * 0.7)
    expect(result.jpyParty.p50).toBeLessThan(deterministic.totalJpyParty * 1.4)
  })

  it('orders percentiles monotonically', () => {
    const config = multiLegConfig()
    const result = runMonteCarlo(config, testPriceData, { seed: 9, trials: 3000 })
    expect(result.jpyParty.p10).toBeLessThanOrEqual(result.jpyParty.p50)
    expect(result.jpyParty.p50).toBeLessThanOrEqual(result.jpyParty.p80)
    expect(result.jpyParty.p80).toBeLessThanOrEqual(result.jpyParty.p90)
  })

  it('divides party percentiles by headcount to get per-person percentiles', () => {
    const config = multiLegConfig()
    const result = runMonteCarlo(config, testPriceData, { seed: 4, trials: 1000 })
    expect(result.jpyPerPerson.p80).toBeCloseTo(result.jpyParty.p80 / 2, 5)
    expect(result.usdPerPerson.p80).toBeCloseTo(result.usdParty.p80 / 2, 5)
  })

  it('reports USD percentiles consistent with the configured FX rate', () => {
    const config = multiLegConfig()
    const result = runMonteCarlo(config, testPriceData, { seed: 5, trials: 5000 })
    // USD P50 should roughly equal JPY P50 / jpyPerUsd (within the FX stress band).
    const impliedRate = result.jpyParty.p50 / result.usdParty.p50
    expect(impliedRate).toBeGreaterThan(config.money.jpyPerUsd * 0.85)
    expect(impliedRate).toBeLessThan(config.money.jpyPerUsd * 1.15)
  })

  it('defaults to 10,000 trials', () => {
    const config = baseTripConfig()
    const result = runMonteCarlo(config, testPriceData, { seed: 1 })
    expect(result.trials).toBe(10000)
  })

  it('handles a zero-person edge case without dividing by zero', () => {
    const config = baseTripConfig({ party: { adults: 0, children: [], rooms: 1 }, flight: { mode: 'exclude', taxesAndFeesUsd: 0 } })
    const result = runMonteCarlo(config, testPriceData, { seed: 1, trials: 500 })
    expect(result.jpyPerPerson).toEqual(result.jpyParty)
  })
})

describe('runMonteCarlo — histogramUsdPerPerson (§6 distribution histogram)', () => {
  it('bins every trial, covering the full min-max range with monotonically increasing edges', () => {
    const config = baseTripConfig()
    const result = runMonteCarlo(config, testPriceData, { seed: 1, trials: 2000 })
    const bins = result.histogramUsdPerPerson

    expect(bins.length).toBeGreaterThan(1)
    expect(bins.reduce((sum, b) => sum + b.count, 0)).toBe(2000)
    expect(bins[0].x0).toBeLessThanOrEqual(result.usdPerPerson.p10)
    expect(bins[bins.length - 1].x1).toBeGreaterThanOrEqual(result.usdPerPerson.p90)
    for (let i = 1; i < bins.length; i++) {
      expect(bins[i].x0).toBeCloseTo(bins[i - 1].x1, 6)
    }
  })

  it('falls back to the party total when there are zero people, without dividing by zero', () => {
    const config = baseTripConfig({ party: { adults: 0, children: [], rooms: 1 }, flight: { mode: 'exclude', taxesAndFeesUsd: 0 } })
    const result = runMonteCarlo(config, testPriceData, { seed: 1, trials: 500 })
    expect(result.histogramUsdPerPerson.reduce((sum, b) => sum + b.count, 0)).toBe(500)
  })
})

describe('computeAdditiveEnvelope', () => {
  it('sums every line item low and every line item high, plus contingency on the variable low/high', () => {
    const config = multiLegConfig()
    const deterministic = computeBudget(config, testPriceData)
    const envelope = computeAdditiveEnvelope(deterministic.lineItems, config.money.contingencyPct, 2)

    expect(envelope.lowJpyParty).toBeLessThanOrEqual(deterministic.totalJpyParty)
    expect(envelope.highJpyParty).toBeGreaterThanOrEqual(deterministic.totalJpyParty)
    expect(envelope.lowJpyPerPerson).toBe(Math.round(envelope.lowJpyParty / 2))
    expect(envelope.highJpyPerPerson).toBe(Math.round(envelope.highJpyParty / 2))
  })

  it('is at least as wide as the Monte Carlo P10-P90 band (it assumes perfect correlation)', () => {
    const config = multiLegConfig()
    const deterministic = computeBudget(config, testPriceData)
    const envelope = computeAdditiveEnvelope(deterministic.lineItems, config.money.contingencyPct, 2)
    const monteCarlo = runMonteCarlo(config, testPriceData, { seed: 6, trials: 5000 })

    expect(envelope.lowJpyParty).toBeLessThanOrEqual(monteCarlo.jpyParty.p10)
    expect(envelope.highJpyParty).toBeGreaterThanOrEqual(monteCarlo.jpyParty.p90)
  })

  it('handles a zero-person edge case without dividing by zero', () => {
    const envelope = computeAdditiveEnvelope([], 10, 0)
    expect(envelope.lowJpyPerPerson).toBe(envelope.lowJpyParty)
    expect(envelope.highJpyPerPerson).toBe(envelope.highJpyParty)
  })
})
