import { useTripConfig } from '../state/TripConfigContext'
import { priceData } from '../data'
import type { FoodTier } from '../../engine/trip'

const TIER_LABELS: Record<FoodTier, string> = {
  konbini: 'Konbini',
  casual: 'Casual',
  standard: 'Standard',
  nice: 'Nice',
  splurge: 'Splurge',
}

type Slot = 'breakfast' | 'lunch' | 'dinner'
const SLOTS: Slot[] = ['breakfast', 'lunch', 'dinner']

function availableTiers(slot: Slot): FoodTier[] {
  const allTiers: FoodTier[] = ['konbini', 'casual', 'standard', 'nice', 'splurge']
  return allTiers.filter((tier) => priceData.prices.some((p) => p.id === `food_${slot}_${tier}`))
}

export function StepEat() {
  const { config, updateConfig } = useTripConfig()
  const legs = config.itinerary.legs
  const tiersBySlot: Record<Slot, FoodTier[]> = {
    breakfast: availableTiers('breakfast'),
    lunch: availableTiers('lunch'),
    dinner: availableTiers('dinner'),
  }

  const setMeal = (index: number, slot: Slot, tier: FoodTier) => {
    updateConfig((c) => {
      const legs = [...c.itinerary.legs]
      legs[index] = { ...legs[index], food: { ...legs[index].food, [slot]: tier } }
      return { ...c, itinerary: { ...c.itinerary, legs } }
    })
  }

  const setSplurgeMeals = (index: number, count: number) => {
    updateConfig((c) => {
      const legs = [...c.itinerary.legs]
      legs[index] = { ...legs[index], splurgeMeals: Math.max(0, count) }
      return { ...c, itinerary: { ...c.itinerary, legs } }
    })
  }

  const applyToAll = (slot: Slot, tier: FoodTier) => {
    updateConfig((c) => ({
      ...c,
      itinerary: { ...c.itinerary, legs: c.itinerary.legs.map((leg) => ({ ...leg, food: { ...leg.food, [slot]: tier } })) },
    }))
  }

  return (
    <div className="step-form">
      <div className="global-default">
        <span className="field-note">Apply to every city:</span>
        {SLOTS.map((slot) => (
          <label key={slot}>
            {slot}
            <select onChange={(e) => e.target.value && applyToAll(slot, e.target.value as FoodTier)} defaultValue="">
              <option value="" disabled>
                (choose)
              </option>
              {tiersBySlot[slot].map((tier) => (
                <option key={tier} value={tier}>
                  {TIER_LABELS[tier]}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <div className="leg-list">
        {legs.map((leg, i) => {
          const city = priceData.cities.find((c) => c.id === leg.cityId)
          const isRyokan = leg.lodgingTier === 'ryokan_hanmeshi' || leg.lodgingTier === 'mountain_hut'
          return (
            <div key={i} className="leg-list__row leg-list__row--wrap">
              <span className="leg-list__city">{city?.name ?? leg.cityId}</span>
              {SLOTS.map((slot) => {
                const zeroed = isRyokan && slot !== 'lunch'
                return (
                  <label key={slot}>
                    {slot}
                    <select value={leg.food[slot]} onChange={(e) => setMeal(i, slot, e.target.value as FoodTier)} disabled={zeroed}>
                      {tiersBySlot[slot].map((tier) => (
                        <option key={tier} value={tier}>
                          {TIER_LABELS[tier]}
                        </option>
                      ))}
                    </select>
                    {zeroed && <span className="field-note">included in ryokan rate</span>}
                  </label>
                )
              })}
              <label>
                Splurge meals
                <input type="number" min={0} value={leg.splurgeMeals} onChange={(e) => setSplurgeMeals(i, Number(e.target.value))} />
              </label>
            </div>
          )
        })}
      </div>
      <p className="field-note">
        A splurge meal (kaiseki / sushi omakase) is counted separately from the daily food average — a single reservation can run
        ¥20,000-60,000/person.
      </p>
    </div>
  )
}
