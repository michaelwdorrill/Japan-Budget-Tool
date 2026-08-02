import type { FoodTier, LodgingTier, ActivityTier, TripConfig, Leg } from '../engine/trip'

// §6/§7: "Lean / Comfortable / Splurge presets so the first-time user
// immediately sees the range of the decision space." TripConfig.preset is
// a label the app writes onto the config after seeding — the engine itself
// treats it as inert metadata; the actual pricing comes entirely from the
// tier fields this function sets.
export type Preset = 'lean' | 'comfortable' | 'splurge'

interface PresetSpec {
  lodgingTier: LodgingTier
  foodTier: FoodTier
  activityTierFallback: ActivityTier
  splurgeMealsPerLeg: number
  personalShoppingBudgetJpy: number
  contingencyPct: number
}

const PRESET_SPECS: Record<Preset, PresetSpec> = {
  lean: {
    lodgingTier: 'hostel',
    foodTier: 'konbini',
    activityTierFallback: 'free_walking',
    splurgeMealsPerLeg: 0,
    personalShoppingBudgetJpy: 5000,
    contingencyPct: 10,
  },
  comfortable: {
    lodgingTier: 'business',
    foodTier: 'casual',
    activityTierFallback: 'light',
    splurgeMealsPerLeg: 0,
    personalShoppingBudgetJpy: 15000,
    contingencyPct: 10,
  },
  splurge: {
    lodgingTier: 'upscale',
    foodTier: 'nice',
    activityTierFallback: 'premium',
    splurgeMealsPerLeg: 1,
    personalShoppingBudgetJpy: 40000,
    contingencyPct: 15,
  },
}

function applyPresetToLeg(leg: Leg, spec: PresetSpec): Leg {
  // A ryokan/mountain-hut leg's meals are already priced into the room
  // rate (§2.3) — overwriting its tier would silently change what's being
  // booked, so presets only touch the food dials and leave those alone.
  const lodgingTier = leg.lodgingTier === 'ryokan_hanmeshi' || leg.lodgingTier === 'mountain_hut' ? leg.lodgingTier : spec.lodgingTier
  return {
    ...leg,
    lodgingTier,
    food: { breakfast: spec.foodTier, lunch: spec.foodTier, dinner: spec.foodTier },
    activityTierFallback: spec.activityTierFallback,
    splurgeMeals: spec.splurgeMealsPerLeg,
  }
}

export function applyPreset(config: TripConfig, preset: Preset): TripConfig {
  const spec = PRESET_SPECS[preset]
  return {
    ...config,
    preset,
    itinerary: {
      ...config.itinerary,
      legs: config.itinerary.legs.map((leg) => applyPresetToLeg(leg, spec)),
    },
    shopping: { personalBudgetJpy: spec.personalShoppingBudgetJpy },
    money: { ...config.money, contingencyPct: spec.contingencyPct },
  }
}
