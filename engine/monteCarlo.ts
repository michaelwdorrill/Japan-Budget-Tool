import type { TripConfig } from './trip'
import type { PriceData } from './priceData'
import { computeBudget, VARIABLE_CATEGORIES } from './budget'
import { totalPeople } from './basis'
import { jpyToUsd } from './money'
import { mulberry32, sampleNormal, samplePert, type Rng } from './random'
import type { LineItem } from './lineItem'

// §3.3: the uncertainty roll-up. Two modes.

export interface Percentiles {
  p10: number
  p50: number
  p80: number
  p90: number
}

// Mode 1 — additive envelope: sum every line's low, sum every line's high.
// Assumes perfect correlation; "everything goes wrong / everything goes
// right." Too wide to budget to, but honest about the worst case.
export interface AdditiveEnvelopeResult {
  lowJpyParty: number
  highJpyParty: number
  lowJpyPerPerson: number
  highJpyPerPerson: number
}

export function computeAdditiveEnvelope(lineItems: LineItem[], contingencyPct: number, totalPeopleCount: number): AdditiveEnvelopeResult {
  let fixedLow = 0
  let fixedHigh = 0
  let variableLow = 0
  let variableHigh = 0

  for (const item of lineItems) {
    if (VARIABLE_CATEGORIES.includes(item.category)) {
      variableLow += item.lowJpy
      variableHigh += item.highJpy
    } else {
      fixedLow += item.lowJpy
      fixedHigh += item.highJpy
    }
  }

  const contingencyLow = Math.round(variableLow * (contingencyPct / 100))
  const contingencyHigh = Math.round(variableHigh * (contingencyPct / 100))
  const lowJpyParty = fixedLow + variableLow + contingencyLow
  const highJpyParty = fixedHigh + variableHigh + contingencyHigh

  return {
    lowJpyParty,
    highJpyParty,
    lowJpyPerPerson: totalPeopleCount > 0 ? Math.round(lowJpyParty / totalPeopleCount) : lowJpyParty,
    highJpyPerPerson: totalPeopleCount > 0 ? Math.round(highJpyParty / totalPeopleCount) : highJpyParty,
  }
}

// Mode 2 — Monte Carlo (default). 10,000 seeded trials. Each line item
// draws from a PERT(low, expected, high) distribution. Costs are not
// independent: a shared multiplicative market factor M ~ Normal(1.0, 0.08)
// is drawn once per trial and applied across every lodging line, and a
// second, independently-drawn factor across every food line — treating 40
// line items as independent draws makes the range collapse toward the mean
// by roughly sqrt(n) and understates the real risk (§3.3). FX is drawn
// separately per trial (its own PERT band from money.fxStressPct) and
// applied once, at the end of that trial, converting the trial's JPY total
// to USD — "exactly once, at the display boundary" (§0.3), just per-trial
// rather than a single global conversion.
export interface MonteCarloOptions {
  trials?: number
  seed?: number
  // Testing/regression hook for §9's Phase 6 gate ("a correlated run
  // produces a visibly wider P10-P90 band than an independent run"). Not
  // exposed in normal use — correlation is always on by default, matching
  // §3.3's model.
  correlated?: boolean
}

export interface HistogramBin {
  x0: number
  x1: number
  count: number
}

export interface MonteCarloResult {
  trials: number
  seed: number
  usdPerPerson: Percentiles
  usdParty: Percentiles
  jpyPerPerson: Percentiles
  jpyParty: Percentiles
  // §6: "Distribution histogram with P10/P50/P80/P90 markers" — the binned
  // per-person USD trial outcomes, for the UI to draw without re-running
  // the simulation. Sorted, equal-width bins; empty input yields [].
  histogramUsdPerPerson: HistogramBin[]
}

const DEFAULT_HISTOGRAM_BIN_COUNT = 24

function buildHistogram(sortedValues: number[], binCount = DEFAULT_HISTOGRAM_BIN_COUNT): HistogramBin[] {
  if (sortedValues.length === 0) return []
  const min = sortedValues[0]
  const max = sortedValues[sortedValues.length - 1]
  if (min === max) return [{ x0: min, x1: max, count: sortedValues.length }]

  const width = (max - min) / binCount
  const bins: HistogramBin[] = Array.from({ length: binCount }, (_, i) => ({
    x0: min + i * width,
    x1: min + (i + 1) * width,
    count: 0,
  }))
  for (const value of sortedValues) {
    const index = Math.min(binCount - 1, Math.floor((value - min) / width))
    bins[index].count += 1
  }
  return bins
}

const LODGING_MARKET_FACTOR_STD_DEV = 0.08
const FOOD_MARKET_FACTOR_STD_DEV = 0.08

function sampleTrialTotalJpy(rng: Rng, lineItems: LineItem[], contingencyPct: number, correlated: boolean): number {
  const lodgingFactor = correlated ? sampleNormal(rng, 1.0, LODGING_MARKET_FACTOR_STD_DEV) : null
  const foodFactor = correlated ? sampleNormal(rng, 1.0, FOOD_MARKET_FACTOR_STD_DEV) : null

  let fixedTotal = 0
  let variableTotal = 0

  for (const item of lineItems) {
    let sampled = samplePert(rng, item.lowJpy, item.amountJpy, item.highJpy)

    if (item.category === 'lodging') {
      sampled *= correlated ? (lodgingFactor as number) : sampleNormal(rng, 1.0, LODGING_MARKET_FACTOR_STD_DEV)
    } else if (item.category === 'food') {
      sampled *= correlated ? (foodFactor as number) : sampleNormal(rng, 1.0, FOOD_MARKET_FACTOR_STD_DEV)
    }

    if (VARIABLE_CATEGORIES.includes(item.category)) {
      variableTotal += sampled
    } else {
      fixedTotal += sampled
    }
  }

  const contingency = variableTotal * (contingencyPct / 100)
  return fixedTotal + variableTotal + contingency
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const index = p * (sorted.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  const frac = index - lower
  return sorted[lower] * (1 - frac) + sorted[upper] * frac
}

function percentilesOf(sorted: number[]): Percentiles {
  return { p10: percentile(sorted, 0.1), p50: percentile(sorted, 0.5), p80: percentile(sorted, 0.8), p90: percentile(sorted, 0.9) }
}

function divideBy(p: Percentiles, n: number): Percentiles {
  if (n <= 0) return p
  return { p10: p.p10 / n, p50: p.p50 / n, p80: p.p80 / n, p90: p.p90 / n }
}

export function runMonteCarlo(config: TripConfig, priceData: PriceData, options: MonteCarloOptions = {}): MonteCarloResult {
  const trials = options.trials ?? 10000
  const seed = options.seed ?? 1
  const correlated = options.correlated ?? true
  const rng = mulberry32(seed)

  const deterministic = computeBudget(config, priceData)
  const totalPeopleCount = totalPeople(config.party)

  const jpyPerUsd = config.money.jpyPerUsd
  const fxBand = jpyPerUsd * (config.money.fxStressPct / 100)
  const fxLow = jpyPerUsd - fxBand
  const fxHigh = jpyPerUsd + fxBand

  const jpyTotals = new Array<number>(trials)
  const usdTotals = new Array<number>(trials)

  for (let t = 0; t < trials; t++) {
    const totalJpy = sampleTrialTotalJpy(rng, deterministic.lineItems, config.money.contingencyPct, correlated)
    jpyTotals[t] = totalJpy

    const fxRate = samplePert(rng, fxLow, jpyPerUsd, fxHigh)
    usdTotals[t] = jpyToUsd(totalJpy, fxRate, { cardFxFeePct: config.money.cardFxFeePct })
  }

  jpyTotals.sort((a, b) => a - b)
  usdTotals.sort((a, b) => a - b)

  const jpyParty = percentilesOf(jpyTotals)
  const usdParty = percentilesOf(usdTotals)

  const usdPerPersonTotals = totalPeopleCount > 0 ? usdTotals.map((v) => v / totalPeopleCount) : usdTotals

  return {
    trials,
    seed,
    jpyParty,
    jpyPerPerson: divideBy(jpyParty, totalPeopleCount),
    usdParty,
    usdPerPerson: divideBy(usdParty, totalPeopleCount),
    histogramUsdPerPerson: buildHistogram(usdPerPersonTotals),
  }
}
