import type { Leg, TripConfig } from './trip'
import type { PriceData } from './priceData'
import { multiplyByBasisRange, totalPeople } from './basis'
import { findPrice } from './priceLookup'
import type { LineItem } from './lineItem'
import { sumLineItems } from './lineItem'

// F: named activity picks plus the activityTierFallback baseline applied
// across every night of the leg (there is no day-by-day itinerary in
// TripConfig to subtract "already-planned" days from, so the fallback is a
// per-night floor and named activities/day trips are additive on top of it).
// dayTrips (leg.dayTrips) have no cost data yet — day-trip pricing needs a
// combined rail-fare + activity model that doesn't exist until Phase 4/7.
export function legActivitiesCost(leg: Leg, people: number, priceData: PriceData): LineItem[] {
  const lineItems: LineItem[] = []

  for (const selection of leg.activities) {
    const activity = findPrice(
      priceData.activities.namedActivities,
      (a) => a.id === selection.activityId,
      `named activity "${selection.activityId}"`,
    )
    const range = multiplyByBasisRange(activity.basis, activity, { people, uses: selection.quantity })
    lineItems.push({
      id: `activity-${activity.id}-${leg.cityId}`,
      label: activity.label,
      category: 'activities',
      subcategory: 'F',
      cityId: leg.cityId,
      ...range,
      confidence: activity.confidence,
    })
  }

  const fallback = findPrice(
    priceData.activities.activityTierFallback,
    (a) => a.tier === leg.activityTierFallback,
    `activity fallback tier "${leg.activityTierFallback}"`,
  )
  const fallbackRange = multiplyByBasisRange(fallback.basis, fallback, { people, days: leg.nights })
  lineItems.push({
    id: `activity-fallback-${leg.cityId}`,
    label: fallback.label,
    category: 'activities',
    subcategory: 'F',
    cityId: leg.cityId,
    ...fallbackRange,
    confidence: fallback.confidence,
  })

  return lineItems
}

export function computeActivities(config: TripConfig, priceData: PriceData): { lineItems: LineItem[]; totalJpy: number } {
  const people = totalPeople(config.party)
  const lineItems = config.itinerary.legs.flatMap((leg) => legActivitiesCost(leg, people, priceData))
  return { lineItems, totalJpy: sumLineItems(lineItems) }
}
