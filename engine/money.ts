// Compute in JPY, display in USD (design thesis §0.3). Currency conversion
// happens exactly once, at the display boundary — these are the only two
// functions in the codebase allowed to divide or multiply by an FX rate.

export function usdToJpy(amountUsd: number, jpyPerUsd: number): number {
  return Math.round(amountUsd * jpyPerUsd)
}

export interface JpyToUsdOptions {
  cardFxFeePct?: number // 0 for a no-FX-fee card, else e.g. 3
}

export function jpyToUsd(amountJpy: number, jpyPerUsd: number, options: JpyToUsdOptions = {}): number {
  const baseUsd = amountJpy / jpyPerUsd
  const feePct = options.cardFxFeePct ?? 0
  return baseUsd * (1 + feePct / 100)
}

export interface FxStressResult {
  lowUsd: number
  expectedUsd: number
  highUsd: number
}

// §0.3: FX is a material budget risk, not a rounding detail. Stress-tests a
// JPY total across a ± band around the given rate (weaker yen -> more USD
// for the same JPY spend, so a *lower* jpyPerUsd is the high-USD-cost case).
export function fxStress(amountJpy: number, jpyPerUsd: number, fxStressPct: number, options: JpyToUsdOptions = {}): FxStressResult {
  const band = fxStressPct / 100
  return {
    lowUsd: jpyToUsd(amountJpy, jpyPerUsd * (1 + band), options),
    expectedUsd: jpyToUsd(amountJpy, jpyPerUsd, options),
    highUsd: jpyToUsd(amountJpy, jpyPerUsd * (1 - band), options),
  }
}
