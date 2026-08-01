import { useTripConfig } from '../state/TripConfigContext'
import { priceData } from '../data'
import type { LodgingTier } from '../../engine/trip'

const TIER_LABELS: Record<LodgingTier, string> = {
  hostel: 'Hostel / capsule',
  business: 'Business hotel',
  midrange: '3-4 star / boutique',
  upscale: '4-5 star / good ryokan',
  luxury: 'Luxury',
  ryokan_hanmeshi: 'Ryokan with dinner + breakfast',
  mountain_hut: 'Mountain hut (dinner + breakfast)',
}

function availableTiers(cityId: string): LodgingTier[] {
  return priceData.prices
    .filter((p) => p.category === 'lodging' && p.cityId === cityId)
    .map((p) => p.tier as LodgingTier)
}

export function StepSleep() {
  const { config, updateConfig } = useTripConfig()
  const legs = config.itinerary.legs

  const setLegTier = (index: number, tier: LodgingTier) => {
    updateConfig((c) => {
      const legs = [...c.itinerary.legs]
      legs[index] = { ...legs[index], lodgingTier: tier }
      return { ...c, itinerary: { ...c.itinerary, legs } }
    })
  }

  const applyToAll = (tier: LodgingTier) => {
    updateConfig((c) => ({
      ...c,
      itinerary: {
        ...c.itinerary,
        legs: c.itinerary.legs.map((leg) => (availableTiers(leg.cityId).includes(tier) ? { ...leg, lodgingTier: tier } : leg)),
      },
    }))
  }

  return (
    <div className="step-form">
      <div className="global-default">
        <span className="field-note">Apply to every city (where available):</span>
        {(Object.keys(TIER_LABELS) as LodgingTier[]).map((tier) => (
          <button key={tier} type="button" onClick={() => applyToAll(tier)}>
            {TIER_LABELS[tier]}
          </button>
        ))}
      </div>

      <div className="leg-list">
        {legs.map((leg, i) => {
          const tiers = availableTiers(leg.cityId)
          const city = priceData.cities.find((c) => c.id === leg.cityId)
          const record = priceData.prices.find((p) => p.category === 'lodging' && p.cityId === leg.cityId && p.tier === leg.lodgingTier)
          return (
            <div key={i} className="leg-list__row">
              <span className="leg-list__city">{city?.name ?? leg.cityId}</span>
              <select value={leg.lodgingTier} onChange={(e) => setLegTier(i, e.target.value as LodgingTier)}>
                {tiers.map((tier) => (
                  <option key={tier} value={tier}>
                    {TIER_LABELS[tier]}
                  </option>
                ))}
              </select>
              {record && (
                <span className="leg-list__reference">
                  {record.label} — ¥{record.expected.toLocaleString('en-US')}
                  {record.basis === 'per_room_per_night' ? '/room/night' : '/person/night'}
                </span>
              )}
            </div>
          )
        })}
      </div>
      {legs.some((leg) => leg.lodgingTier === 'ryokan_hanmeshi' || leg.lodgingTier === 'mountain_hut') && (
        <p className="field-note">A ryokan-with-meals or mountain-hut leg zeroes that leg's breakfast and dinner cost in step 4 — meals are included.</p>
      )}
    </div>
  )
}
