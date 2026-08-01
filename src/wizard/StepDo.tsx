import { useTripConfig } from '../state/TripConfigContext'
import { priceData } from '../data'
import type { ActivityTier } from '../../engine/trip'

const FALLBACK_LABELS: Record<ActivityTier, string> = {
  free_walking: 'Free / walking',
  light: 'Light',
  standard: 'Standard',
  premium: 'Premium',
}

export function StepDo() {
  const { config, updateConfig } = useTripConfig()
  const legs = config.itinerary.legs

  const setFallback = (index: number, tier: ActivityTier) => {
    updateConfig((c) => {
      const legs = [...c.itinerary.legs]
      legs[index] = { ...legs[index], activityTierFallback: tier }
      return { ...c, itinerary: { ...c.itinerary, legs } }
    })
  }

  const toggleActivity = (index: number, activityId: string, checked: boolean) => {
    updateConfig((c) => {
      const legs = [...c.itinerary.legs]
      const leg = legs[index]
      const activities = checked
        ? [...leg.activities, { activityId, quantity: 1 }]
        : leg.activities.filter((a) => a.activityId !== activityId)
      legs[index] = { ...leg, activities }
      return { ...c, itinerary: { ...c.itinerary, legs } }
    })
  }

  const setQuantity = (index: number, activityId: string, quantity: number) => {
    updateConfig((c) => {
      const legs = [...c.itinerary.legs]
      const leg = legs[index]
      legs[index] = {
        ...leg,
        activities: leg.activities.map((a) => (a.activityId === activityId ? { ...a, quantity: Math.max(1, quantity) } : a)),
      }
      return { ...c, itinerary: { ...c.itinerary, legs } }
    })
  }

  return (
    <div className="step-form">
      {legs.map((leg, i) => {
        const city = priceData.cities.find((c) => c.id === leg.cityId)
        const cityActivities = priceData.activities.namedActivities.filter((a) => a.cityId === leg.cityId)

        return (
          <fieldset key={i}>
            <legend>{city?.name ?? leg.cityId}</legend>

            <label>
              Fallback tier for unplanned days
              <select value={leg.activityTierFallback} onChange={(e) => setFallback(i, e.target.value as ActivityTier)}>
                {(Object.keys(FALLBACK_LABELS) as ActivityTier[]).map((tier) => (
                  <option key={tier} value={tier}>
                    {FALLBACK_LABELS[tier]}
                  </option>
                ))}
              </select>
            </label>

            <div className="activity-list">
              {cityActivities.length === 0 && <p className="field-note">No named activities seeded for this city yet.</p>}
              {cityActivities.map((activity) => {
                const selection = leg.activities.find((a) => a.activityId === activity.id)
                return (
                  <div key={activity.id} className="activity-list__row">
                    <label>
                      <input
                        type="checkbox"
                        checked={!!selection}
                        onChange={(e) => toggleActivity(i, activity.id, e.target.checked)}
                      />
                      {activity.label} — ¥{activity.expected.toLocaleString('en-US')}/person
                    </label>
                    {selection && (
                      <label>
                        ×
                        <input
                          type="number"
                          min={1}
                          value={selection.quantity}
                          onChange={(e) => setQuantity(i, activity.id, Number(e.target.value))}
                        />
                      </label>
                    )}
                    {activity.advanceBookingLeadTime && <span className="field-note">{activity.advanceBookingLeadTime}</span>}
                  </div>
                )
              })}
            </div>
          </fieldset>
        )
      })}
    </div>
  )
}
