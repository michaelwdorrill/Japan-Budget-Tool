import { useTripConfig } from '../state/TripConfigContext'
import { priceData } from '../data'
import { PRESETS } from '../state/defaultTripConfig'
import type { Leg } from '../../engine/trip'

function newLeg(cityId: string): Leg {
  return {
    cityId,
    nights: 2,
    lodgingTier: 'business',
    food: { breakfast: 'casual', lunch: 'casual', dinner: 'standard' },
    activities: [],
    activityTierFallback: 'light',
    dayTrips: [],
    splurgeMeals: 0,
  }
}

export function StepWhere() {
  const { config, updateConfig, setConfig } = useTripConfig()
  const legs = config.itinerary.legs

  const setLegs = (legs: Leg[]) => {
    updateConfig((c) => ({ ...c, itinerary: { ...c.itinerary, legs } }))
  }

  const addLeg = () => {
    setLegs([...legs, newLeg(priceData.cities[0].id)])
  }

  const removeLeg = (index: number) => {
    if (legs.length <= 1) return
    setLegs(legs.filter((_, i) => i !== index))
  }

  const setLegCity = (index: number, cityId: string) => {
    const next = [...legs]
    next[index] = { ...next[index], cityId }
    setLegs(next)
  }

  const setLegNights = (index: number, nights: number) => {
    const next = [...legs]
    next[index] = { ...next[index], nights: Math.max(0, nights) }
    setLegs(next)
  }

  const moveLeg = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= legs.length) return
    const next = [...legs]
    ;[next[index], next[target]] = [next[target], next[index]]
    setLegs(next)
  }

  const totalNights = legs.reduce((sum, l) => sum + l.nights, 0)
  const nightsMismatch = totalNights !== config.timing.nights

  return (
    <div className="step-form">
      <div className="presets">
        <span className="field-note">Presets:</span>
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => setConfig({ ...preset.config, party: config.party, money: config.money })}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="leg-list">
        {legs.map((leg, i) => (
          <div key={i} className="leg-list__row">
            <span className="leg-list__order">{i + 1}</span>
            <select value={leg.cityId} onChange={(e) => setLegCity(i, e.target.value)}>
              {priceData.cities.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </select>
            <label>
              Nights
              <input type="number" min={0} value={leg.nights} onChange={(e) => setLegNights(i, Number(e.target.value))} />
            </label>
            <button type="button" onClick={() => moveLeg(i, -1)} disabled={i === 0} aria-label="Move earlier">
              ↑
            </button>
            <button type="button" onClick={() => moveLeg(i, 1)} disabled={i === legs.length - 1} aria-label="Move later">
              ↓
            </button>
            <button type="button" onClick={() => removeLeg(i)} disabled={legs.length <= 1}>
              Remove
            </button>
          </div>
        ))}
        <button type="button" onClick={addLeg}>
          + Add city
        </button>
      </div>

      <p className={nightsMismatch ? 'field-note field-note--warning' : 'field-note'}>
        {totalNights} night{totalNights === 1 ? '' : 's'} allocated across cities
        {nightsMismatch ? ` — trip is set to ${config.timing.nights} nights (step 1); adjust either to match.` : '.'}
      </p>
    </div>
  )
}
