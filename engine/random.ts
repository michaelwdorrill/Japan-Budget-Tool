// Seeded PRNG + distribution sampling for the Monte Carlo uncertainty
// roll-up (§3.3). Everything here is a pure function of its seed/state so a
// run is exactly reproducible given the same seed and inputs.

export type Rng = () => number // uniform [0, 1)

// mulberry32: small, fast, good-enough statistical quality for Monte Carlo
// budgeting (not cryptographic). Returns a new independent generator
// function closed over its own state.
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Box-Muller transform: one standard normal sample per call.
export function sampleStandardNormal(rng: Rng): number {
  let u1 = rng()
  while (u1 <= Number.EPSILON) u1 = rng() // avoid log(0)
  const u2 = rng()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

export function sampleNormal(rng: Rng, mean: number, stdDev: number): number {
  return mean + sampleStandardNormal(rng) * stdDev
}

// PERT distribution via a Beta(alpha, beta) reparameterization, the
// standard modified-PERT construction with shape parameter 4 (weights the
// modal/expected estimate more heavily than a plain triangular
// distribution, per §3.3). Degenerates to a point mass when low === high.
export function samplePert(rng: Rng, low: number, mode: number, high: number, shape = 4): number {
  if (high <= low) return mode

  const clampedMode = Math.min(Math.max(mode, low), high)
  const alpha = 1 + (shape * (clampedMode - low)) / (high - low)
  const beta = 1 + (shape * (high - clampedMode)) / (high - low)
  const sample = sampleBeta(rng, alpha, beta)
  return low + sample * (high - low)
}

// Beta(alpha, beta) via two Gamma draws (Marsaglia-Tsang for shape >= 1,
// which alpha/beta always are here since shape=4 and low<=mode<=high).
function sampleBeta(rng: Rng, alpha: number, beta: number): number {
  const x = sampleGamma(rng, alpha)
  const y = sampleGamma(rng, beta)
  return x / (x + y)
}

function sampleGamma(rng: Rng, shape: number): number {
  // Marsaglia-Tsang method, valid for shape >= 1.
  const d = shape - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  for (;;) {
    let x: number
    let v: number
    do {
      x = sampleStandardNormal(rng)
      v = 1 + c * x
    } while (v <= 0)
    v = v * v * v
    const u = rng()
    if (u < 1 - 0.0331 * x * x * x * x) return d * v
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
  }
}
