export type { PriceData } from './priceData'
export type { TripConfig, Leg } from './trip'
export type { LineItem } from './lineItem'
export type { TransportOption } from './transportOptimizer'
export { computeBudget, VARIABLE_CATEGORIES } from './budget'
export type { BudgetResult } from './budget'

// I2 (FX buffer / display-boundary conversion) is exposed via money.ts's
// jpyToUsd/fxStress; the deterministic engine reports the total in JPY only.
export { usdToJpy, jpyToUsd, fxStress } from './money'
export { addDaysToIsoDate, daysBetweenIsoDates } from './dateUtils'
export { multiplyByBasis, totalPeople, fareEquivalentPeople, childFareFraction } from './basis'
export { lodgingTax, departureTax } from './tax'
export { optimizeTransport, findTransportOption } from './transportOptimizer'
export { runMonteCarlo, computeAdditiveEnvelope } from './monteCarlo'
export type { MonteCarloResult, Percentiles, AdditiveEnvelopeResult, HistogramBin } from './monteCarlo'
export { computeSensitivity, shiftNights, shiftLodgingTier } from './sensitivity'
export type { SensitivityFactor } from './sensitivity'
export { computeGuidance, shiftToNearestShoulderSeason } from './guidance'
export type { GuidanceMessage, GuidanceCategory, GuidanceOptions } from './guidance'

// loadPriceData is deliberately NOT re-exported here: it does `node:fs` I/O
// and this barrel is imported by browser code (src/). Node-only consumers
// (the CLI, generate-expected-fixtures) import it directly from
// './loadPriceData' instead, keeping the browser-facing module graph
// free of Node built-ins.
