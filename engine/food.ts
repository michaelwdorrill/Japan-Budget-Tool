import type { FoodTier, Leg, TripConfig } from './trip'
import type { PriceData } from './priceData'
import type { Tier } from './price'
import { multiplyByBasisRange, totalPeople } from './basis'
import { findPrice, findPriceById } from './priceLookup'
import type { LineItem } from './lineItem'
import { sumLineItems } from './lineItem'

type MealSlot = 'breakfast' | 'lunch' | 'dinner'

// Lodging tiers whose rate already includes dinner and breakfast (§2.3):
// a ryokan-with-meals, or a mountain hut on a multi-day climb.
const MEALS_INCLUDED_TIERS: Tier[] = ['ryokan_hanmeshi', 'mountain_hut']

function mealCost(slot: MealSlot, tier: FoodTier, people: number, nights: number, priceData: PriceData): LineItem {
  const record = findPrice(
    priceData.prices,
    (p) => p.category === 'food' && p.id === `food_${slot}_${tier}`,
    `food ${slot} tier "${tier}"`,
  )
  const subcategory = slot === 'breakfast' ? 'E1' : slot === 'lunch' ? 'E2' : 'E3'
  return {
    id: `food-${slot}-${record.id}`,
    label: record.label,
    category: 'food',
    subcategory,
    ...multiplyByBasisRange(record.basis, record, { people, days: nights }),
    confidence: record.confidence,
  }
}

// E1-E3: breakfast/lunch/dinner by tier, per leg. When a leg's lodging tier
// already bundles meals (ryokan_hanmeshi, mountain_hut), dinner and
// breakfast are already included in the room rate (§2.3) and must be
// zeroed here to avoid double-counting.
export function legFoodCost(leg: Leg, people: number, priceData: PriceData): LineItem[] {
  const mealsIncluded = MEALS_INCLUDED_TIERS.includes(leg.lodgingTier)
  const lineItems: LineItem[] = []

  if (!mealsIncluded) {
    lineItems.push(mealCost('breakfast', leg.food.breakfast, people, leg.nights, priceData))
  }
  lineItems.push(mealCost('lunch', leg.food.lunch, people, leg.nights, priceData))
  if (!mealsIncluded) {
    lineItems.push(mealCost('dinner', leg.food.dinner, people, leg.nights, priceData))
  }

  if (leg.splurgeMeals > 0) {
    const record = findPriceById(priceData.prices, 'splurge_meal_kaiseki_omakase')
    lineItems.push({
      id: `food-splurge-${leg.cityId}`,
      label: record.label,
      category: 'food',
      subcategory: 'E4',
      cityId: leg.cityId,
      ...multiplyByBasisRange(record.basis, record, { people, uses: leg.splurgeMeals }),
      confidence: record.confidence,
    })
  }

  return lineItems
}

export interface FoodResult {
  lineItems: LineItem[]
  totalJpy: number
}

export function computeFood(config: TripConfig, priceData: PriceData): FoodResult {
  const people = totalPeople(config.party)
  const lineItems: LineItem[] = []

  for (const leg of config.itinerary.legs) {
    lineItems.push(...legFoodCost(leg, people, priceData))
  }

  // E5: drinks/coffee/snacks, once per trip-night rather than per leg meal slot.
  const drinksRecord = findPriceById(priceData.prices, 'food_drinks_snacks')
  const totalNights = config.itinerary.legs.reduce((sum, leg) => sum + leg.nights, 0)
  lineItems.push({
    id: 'food-drinks-snacks',
    label: drinksRecord.label,
    category: 'food',
    subcategory: 'E5',
    ...multiplyByBasisRange(drinksRecord.basis, drinksRecord, { people, days: totalNights }),
    confidence: drinksRecord.confidence,
  })

  return { lineItems, totalJpy: sumLineItems(lineItems) }
}
