import { describe, expect, it } from 'vitest'
import { mulberry32, sampleNormal, samplePert, sampleStandardNormal } from './random'

describe('mulberry32', () => {
  it('is deterministic given the same seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const seqA = Array.from({ length: 20 }, () => a())
    const seqB = Array.from({ length: 20 }, () => b())
    expect(seqA).toEqual(seqB)
  })

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    const seqA = Array.from({ length: 20 }, () => a())
    const seqB = Array.from({ length: 20 }, () => b())
    expect(seqA).not.toEqual(seqB)
  })

  it('stays within [0, 1)', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('sampleStandardNormal / sampleNormal', () => {
  it('is deterministic given the same seeded rng state', () => {
    const a = mulberry32(99)
    const b = mulberry32(99)
    expect(sampleStandardNormal(a)).toBe(sampleStandardNormal(b))
  })

  it('has approximately the requested mean and spread over many samples', () => {
    const rng = mulberry32(123)
    const samples = Array.from({ length: 20000 }, () => sampleNormal(rng, 1.0, 0.08))
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length
    const variance = samples.reduce((s, v) => s + (v - mean) ** 2, 0) / samples.length
    expect(mean).toBeCloseTo(1.0, 1)
    expect(Math.sqrt(variance)).toBeCloseTo(0.08, 1)
  })
})

describe('samplePert', () => {
  it('is deterministic given the same seed', () => {
    const a = mulberry32(5)
    const b = mulberry32(5)
    const seqA = Array.from({ length: 50 }, () => samplePert(a, 100, 150, 300))
    const seqB = Array.from({ length: 50 }, () => samplePert(b, 100, 150, 300))
    expect(seqA).toEqual(seqB)
  })

  it('always stays within [low, high]', () => {
    const rng = mulberry32(11)
    for (let i = 0; i < 2000; i++) {
      const v = samplePert(rng, 10000, 15000, 50000)
      expect(v).toBeGreaterThanOrEqual(10000)
      expect(v).toBeLessThanOrEqual(50000)
    }
  })

  it('returns the mode as a point mass when low === high', () => {
    const rng = mulberry32(3)
    expect(samplePert(rng, 5000, 5000, 5000)).toBe(5000)
  })

  it('clusters closer to the mode than a uniform distribution would', () => {
    const rng = mulberry32(21)
    const low = 0
    const mode = 100
    const high = 1000
    const samples = Array.from({ length: 5000 }, () => samplePert(rng, low, mode, high))
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length
    // A uniform distribution over [0, 1000] would have mean 500; PERT's
    // mode-weighting should pull the mean well below that.
    expect(mean).toBeLessThan(300)
  })

  it('handles an asymmetric range where the mode sits near the low end', () => {
    const rng = mulberry32(31)
    const samples = Array.from({ length: 2000 }, () => samplePert(rng, 0, 10, 1000))
    expect(samples.every((v) => v >= 0 && v <= 1000)).toBe(true)
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length
    expect(mean).toBeLessThan(200)
  })
})
