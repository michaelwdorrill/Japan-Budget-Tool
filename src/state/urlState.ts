import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { TripConfig } from '../../engine/trip'

// §1: "Full app state serialized into the URL (compressed base64 query
// param) so a configured trip is a shareable link. This is also the
// persistence mechanism — no accounts, no localStorage."
export const TRIP_QUERY_PARAM = 't'

export function encodeTripConfig(config: TripConfig): string {
  return compressToEncodedURIComponent(JSON.stringify(config))
}

export function decodeTripConfig(encoded: string): TripConfig | null {
  try {
    const json = decompressFromEncodedURIComponent(encoded)
    if (!json) return null
    const parsed = JSON.parse(json)
    if (!isPlausibleTripConfig(parsed)) return null
    return parsed as TripConfig
  } catch {
    return null
  }
}

// A structural sanity check, not full schema validation — just enough to
// refuse to hand a malformed object to the engine and crash the app.
function isPlausibleTripConfig(value: unknown): value is TripConfig {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.party === 'object' &&
    typeof v.timing === 'object' &&
    typeof v.itinerary === 'object' &&
    typeof v.flight === 'object' &&
    typeof v.money === 'object' &&
    typeof v.transport === 'object'
  )
}

export function tripConfigFromUrl(url: string | URL): TripConfig | null {
  const parsed = typeof url === 'string' ? new URL(url) : url
  const encoded = parsed.searchParams.get(TRIP_QUERY_PARAM)
  if (!encoded) return null
  return decodeTripConfig(encoded)
}

export function urlWithTripConfig(baseUrl: string | URL, config: TripConfig): URL {
  const url = new URL(baseUrl)
  url.searchParams.set(TRIP_QUERY_PARAM, encodeTripConfig(config))
  return url
}
