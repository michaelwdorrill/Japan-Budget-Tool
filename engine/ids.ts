// Branded string ID types. Definitions (the actual set of valid IDs) live in
// /data/*.json, loaded and validated at runtime — these are compile-time
// placeholders only, per §2 and §8 of the build spec.

export type CityId = string
export type AirportId = 'NRT' | 'HND' | 'KIX' | 'ITM' | 'CTS' | 'FUK' | 'NGO'
export type SeasonId = string
export type DayTripId = string
export type ExplicitPassId = string
