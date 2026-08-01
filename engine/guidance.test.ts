import { describe, expect, it } from 'vitest'
import { computeBudget } from './budget'
import { computeGuidance } from './guidance'
import { testPriceData } from './testFixtures/priceData'
import { baseTripConfig } from './testFixtures/tripConfig'
import type { Leg, TripConfig } from './trip'

function legWith(overrides: Partial<Leg>): Leg {
  return {
    cityId: 'tokyo',
    nights: 1,
    lodgingTier: 'business',
    food: { breakfast: 'casual', lunch: 'casual', dinner: 'casual' },
    activities: [],
    activityTierFallback: 'light',
    dayTrips: [],
    splurgeMeals: 0,
    ...overrides,
  }
}

function messagesFor(config: TripConfig, ruleId: string, includeSeasonShiftCounterfactual = false) {
  const budget = computeBudget(config, testPriceData)
  return computeGuidance(config, testPriceData, budget, { includeSeasonShiftCounterfactual }).filter((m) => m.ruleId === ruleId)
}

describe('computeGuidance (§5.2)', () => {
  describe('bracket-edge-warning', () => {
    it('fires when a leg lodging rate sits within the warning threshold of a Kyoto tax bracket edge', () => {
      const config = baseTripConfig({
        party: { adults: 1, children: [], rooms: 1 },
        itinerary: {
          arrivalAirport: 'NRT',
          departureAirport: 'NRT',
          legs: [legWith({ cityId: 'kyoto', lodgingTier: 'midrange' })],
        },
      })
      expect(messagesFor(config, 'bracket-edge-warning')).toHaveLength(1)
    })

    it('does not fire for a leg with no lodging tax record nearby a bracket edge', () => {
      const config = baseTripConfig()
      expect(messagesFor(config, 'bracket-edge-warning')).toHaveLength(0)
    })
  })

  describe('ryokan-meals-confirmation', () => {
    it('fires for a ryokan_hanmeshi leg', () => {
      const config = baseTripConfig({
        itinerary: {
          arrivalAirport: 'NRT',
          departureAirport: 'NRT',
          legs: [legWith({ lodgingTier: 'ryokan_hanmeshi' })],
        },
      })
      expect(messagesFor(config, 'ryokan-meals-confirmation')).toHaveLength(1)
    })

    it('does not fire for a business-tier leg', () => {
      expect(messagesFor(baseTripConfig(), 'ryokan-meals-confirmation')).toHaveLength(0)
    })
  })

  describe('onsen-tattoo-policy', () => {
    it('fires when a leg includes an onsen-named activity', () => {
      const config = baseTripConfig({
        itinerary: {
          arrivalAirport: 'NRT',
          departureAirport: 'NRT',
          legs: [legWith({ activities: [{ activityId: 'test_onsen_day_pass', quantity: 1 }] })],
        },
      })
      expect(messagesFor(config, 'onsen-tattoo-policy')).toHaveLength(1)
    })

    it('fires for a ryokan_hanmeshi leg even without a named onsen activity', () => {
      const config = baseTripConfig({
        itinerary: {
          arrivalAirport: 'NRT',
          departureAirport: 'NRT',
          legs: [legWith({ lodgingTier: 'ryokan_hanmeshi' })],
        },
      })
      expect(messagesFor(config, 'onsen-tattoo-policy')).toHaveLength(1)
    })

    it('does not fire for a leg with no onsen exposure', () => {
      expect(messagesFor(baseTripConfig(), 'onsen-tattoo-policy')).toHaveLength(0)
    })
  })

  describe('luggage-forwarding-suggestion', () => {
    it('fires at 3+ city changes when luggage forwarding is off', () => {
      const config = baseTripConfig({
        transport: { strategy: 'point_to_point', railClass: 'ordinary', luggageForwarding: false },
        itinerary: {
          arrivalAirport: 'NRT',
          departureAirport: 'NRT',
          legs: [
            legWith({ cityId: 'tokyo' }),
            legWith({ cityId: 'kyoto' }),
            legWith({ cityId: 'tokyo' }),
            legWith({ cityId: 'kyoto' }),
          ],
        },
      })
      const messages = messagesFor(config, 'luggage-forwarding-suggestion')
      expect(messages).toHaveLength(1)
      expect(messages[0].costDeltaJpy).toBeGreaterThan(0)
    })

    it('does not fire for a single-leg trip', () => {
      expect(messagesFor(baseTripConfig(), 'luggage-forwarding-suggestion')).toHaveLength(0)
    })
  })

  describe('advance-booking-lead-time', () => {
    it('fires for a selected activity that has a lead time', () => {
      const config = baseTripConfig({
        itinerary: {
          arrivalAirport: 'NRT',
          departureAirport: 'NRT',
          legs: [legWith({ activities: [{ activityId: 'test_activity_advance_booking', quantity: 1 }] })],
        },
      })
      expect(messagesFor(config, 'advance-booking-lead-time')).toHaveLength(1)
    })

    it('does not fire for a selected activity with no lead time', () => {
      const config = baseTripConfig({
        itinerary: {
          arrivalAirport: 'NRT',
          departureAirport: 'NRT',
          legs: [legWith({ activities: [{ activityId: 'test_activity_tokyo', quantity: 1 }] })],
        },
      })
      expect(messagesFor(config, 'advance-booking-lead-time')).toHaveLength(0)
    })
  })

  describe('laundry-note', () => {
    it('fires for a trip over 10 nights', () => {
      const config = baseTripConfig({ timing: { startDate: '2026-06-01', season: null, nights: 11 } })
      expect(messagesFor(config, 'laundry-note')).toHaveLength(1)
    })

    it('does not fire for a short trip', () => {
      expect(messagesFor(baseTripConfig(), 'laundry-note')).toHaveLength(0)
    })
  })

  describe('tokyo-day-trip-base-note', () => {
    it('fires for a Tokyo leg over 5 nights with day trips planned', () => {
      const config = baseTripConfig({
        timing: { startDate: '2026-06-01', season: null, nights: 6 },
        itinerary: {
          arrivalAirport: 'NRT',
          departureAirport: 'NRT',
          legs: [legWith({ cityId: 'tokyo', nights: 6, dayTrips: ['nikko'] })],
        },
      })
      expect(messagesFor(config, 'tokyo-day-trip-base-note')).toHaveLength(1)
    })

    it('does not fire for a short Tokyo leg with no day trips', () => {
      expect(messagesFor(baseTripConfig(), 'tokyo-day-trip-base-note')).toHaveLength(0)
    })
  })

  describe('kyoto-osaka-base-delta', () => {
    it('fires when Kyoto lodging costs more than the same tier in Osaka', () => {
      const config = baseTripConfig({
        itinerary: {
          arrivalAirport: 'NRT',
          departureAirport: 'NRT',
          legs: [legWith({ cityId: 'kyoto', lodgingTier: 'business' })],
        },
      })
      const messages = messagesFor(config, 'kyoto-osaka-base-delta')
      expect(messages).toHaveLength(1)
      expect(messages[0].costDeltaJpy).toBe((12000 - 9000) * 1 * 1)
    })

    it('does not fire for a non-Kyoto leg', () => {
      expect(messagesFor(baseTripConfig(), 'kyoto-osaka-base-delta')).toHaveLength(0)
    })
  })

  describe('card-fx-fee-cost', () => {
    it('fires when the card has a nonzero FX fee', () => {
      const config = baseTripConfig({
        money: { jpyPerUsd: 150, fxStressPct: 10, cardFxFeePct: 3, cashJpyPerPersonPerDay: 3000, contingencyPct: 10 },
      })
      expect(messagesFor(config, 'card-fx-fee-cost')).toHaveLength(1)
    })

    it('does not fire for a no-FX-fee card', () => {
      expect(messagesFor(baseTripConfig(), 'card-fx-fee-cost')).toHaveLength(0)
    })
  })

  describe('children-fare-occupancy', () => {
    it('fires when the party includes children', () => {
      const config = baseTripConfig({ party: { adults: 2, children: [{ age: 8 }], rooms: 1 } })
      expect(messagesFor(config, 'children-fare-occupancy')).toHaveLength(1)
    })

    it('does not fire for an adults-only party', () => {
      expect(messagesFor(baseTripConfig(), 'children-fare-occupancy')).toHaveLength(0)
    })
  })

  describe('season-shift-counterfactual (§5.1)', () => {
    it('fires with a positive P80 delta when a leg overlaps a peak season', () => {
      const config = baseTripConfig({ timing: { startDate: '2026-03-25', season: null, nights: 3 } })
      const messages = messagesFor(config, 'season-shift-counterfactual', true)
      expect(messages).toHaveLength(1)
      expect(messages[0].costDeltaJpy).toBeGreaterThan(0)
    })

    it('does not fire when no leg overlaps a season window', () => {
      const messages = messagesFor(baseTripConfig(), 'season-shift-counterfactual', true)
      expect(messages).toHaveLength(0)
    })

    it('is skipped entirely when includeSeasonShiftCounterfactual is false, even if a season overlaps', () => {
      const config = baseTripConfig({ timing: { startDate: '2026-03-25', season: null, nights: 3 } })
      expect(messagesFor(config, 'season-shift-counterfactual', false)).toHaveLength(0)
    })
  })

  // The remaining rules in §5.2 are unconditional ("Always") — the spec
  // gives no gating condition, so there is no fixture that should suppress
  // them. Each is checked once, for presence.
  describe('always-on notes', () => {
    it('includes the cash/ATM, tax-free-shopping, consumption-tax, US-passport, and passport/insurance/meds notes for any trip', () => {
      const budget = computeBudget(baseTripConfig(), testPriceData)
      const messages = computeGuidance(baseTripConfig(), testPriceData, budget)
      const ruleIds = messages.map((m) => m.ruleId)
      expect(ruleIds).toContain('cash-atms')
      expect(ruleIds).toContain('tax-free-shopping')
      expect(ruleIds).toContain('consumption-tax-included')
      expect(ruleIds).toContain('us-passport-entry')
      expect(ruleIds).toContain('passport-insurance-meds')
    })
  })
})
