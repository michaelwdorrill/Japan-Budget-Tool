import { describe, expect, it } from 'vitest'
import { applyPreset } from './presets'
import { defaultTripConfig } from './state/defaultTripConfig'

describe('applyPreset', () => {
  it('seeds every leg with the lean tiers and a lower shopping/contingency budget', () => {
    const config = applyPreset(defaultTripConfig(), 'lean')
    expect(config.preset).toBe('lean')
    for (const leg of config.itinerary.legs) {
      expect(leg.lodgingTier).toBe('hostel')
      expect(leg.food).toEqual({ breakfast: 'konbini', lunch: 'konbini', dinner: 'konbini' })
      expect(leg.activityTierFallback).toBe('free_walking')
      expect(leg.splurgeMeals).toBe(0)
    }
    expect(config.shopping?.personalBudgetJpy).toBe(5000)
    expect(config.money.contingencyPct).toBe(10)
  })

  it('seeds every leg with the splurge tiers and a higher shopping/contingency budget', () => {
    const config = applyPreset(defaultTripConfig(), 'splurge')
    expect(config.preset).toBe('splurge')
    for (const leg of config.itinerary.legs) {
      expect(leg.lodgingTier).toBe('upscale')
      expect(leg.food).toEqual({ breakfast: 'nice', lunch: 'nice', dinner: 'nice' })
      expect(leg.activityTierFallback).toBe('premium')
      expect(leg.splurgeMeals).toBe(1)
    }
    expect(config.shopping?.personalBudgetJpy).toBe(40000)
    expect(config.money.contingencyPct).toBe(15)
  })

  it('does not override a ryokan_hanmeshi leg lodging tier, since its meals are already priced in', () => {
    const base = defaultTripConfig()
    const withRyokan = {
      ...base,
      itinerary: {
        ...base.itinerary,
        legs: [{ ...base.itinerary.legs[0], lodgingTier: 'ryokan_hanmeshi' as const }],
      },
    }
    const config = applyPreset(withRyokan, 'lean')
    expect(config.itinerary.legs[0].lodgingTier).toBe('ryokan_hanmeshi')
  })
})
