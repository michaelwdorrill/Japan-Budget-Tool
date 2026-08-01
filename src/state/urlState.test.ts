import { describe, expect, it } from 'vitest'
import { decodeTripConfig, encodeTripConfig, tripConfigFromUrl, urlWithTripConfig } from './urlState'
import { defaultTripConfig, GOLDEN_ROUTE_PRESET } from './defaultTripConfig'

// Phase 5 gate (§9): "a configured trip survives a copy-paste of the URL
// into a fresh browser." These tests simulate that: encode a config into a
// URL, then decode it from a brand-new URL object built from the same
// string — nothing is shared in memory between encode and decode beyond the
// string itself, the same as pasting a link into a new browser tab.

describe('URL trip config round-trip', () => {
  it('round-trips the default config exactly', () => {
    const config = defaultTripConfig()
    const encoded = encodeTripConfig(config)
    const decoded = decodeTripConfig(encoded)
    expect(decoded).toEqual(config)
  })

  it('round-trips a multi-leg preset with nested arrays exactly', () => {
    const encoded = encodeTripConfig(GOLDEN_ROUTE_PRESET)
    const decoded = decodeTripConfig(encoded)
    expect(decoded).toEqual(GOLDEN_ROUTE_PRESET)
  })

  it('round-trips through a full URL string, simulating a copy-pasted link', () => {
    const config = { ...defaultTripConfig(), party: { adults: 3, children: [{ age: 8 }, { age: 2 }], rooms: 2 } }
    const url = urlWithTripConfig('https://example.com/japan-budget-tool/', config)

    // Simulate "paste into a fresh browser": construct a brand-new URL object
    // from nothing but the string form.
    const freshUrl = new URL(url.toString())
    const decoded = tripConfigFromUrl(freshUrl)

    expect(decoded).toEqual(config)
  })

  it('preserves special characters in string fields (labels, dates)', () => {
    const config = { ...defaultTripConfig(), timing: { startDate: '2026-04-01', season: null, nights: 5 } }
    const decoded = decodeTripConfig(encodeTripConfig(config))
    expect(decoded?.timing.startDate).toBe('2026-04-01')
  })

  it('returns null for a URL with no trip query param', () => {
    expect(tripConfigFromUrl('https://example.com/')).toBeNull()
  })

  it('returns null for garbage in the query param rather than throwing', () => {
    expect(tripConfigFromUrl('https://example.com/?t=not-valid-lz-string-data')).toBeNull()
  })

  it('returns null for validly-compressed but structurally wrong JSON', () => {
    const encoded = encodeTripConfig as unknown as (v: unknown) => string
    const badEncoded = encoded({ not: 'a trip config' })
    expect(decodeTripConfig(badEncoded)).toBeNull()
  })

  it('produces a compact, URL-safe encoded string', () => {
    const encoded = encodeTripConfig(GOLDEN_ROUTE_PRESET)
    expect(encoded).toMatch(/^[A-Za-z0-9+/=-]+$/)
    // Sanity check that compression is actually helping vs. raw JSON length.
    expect(encoded.length).toBeLessThan(JSON.stringify(GOLDEN_ROUTE_PRESET).length)
  })
})
