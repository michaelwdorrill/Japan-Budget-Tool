import type { FoodTier, Leg, TripConfig } from './trip'
import type { PriceData } from './priceData'
import { multiplyByBasis, totalPeople } from './basis'
import { findPrice, findPriceById } from './priceLookup'
import type { LineItem } from './lineItem'
import { sumLineItems } from './lineItem'

type MealSlot = 'breakfast' | 'lunch' | 'dinner'

function mealCost(slot: MealSlot, tier: FoodTier, people: number, nights: number, priceData: PriceData): LineItem {
  const record = findPrice(
    priceData.prices,
    (p) => p.category === 'food' && p.id === `food_${slot}_${tier}`,
    `food ${slot} tier "${tier}"`,
  )
  const amountJpy = multiplyByBasis(record.basis, record.expected, { people, days: nights })
  const subcategory = slot === 'breakfast' ? 'E1' : slot === 'lunch' ? 'E2' : 'E3'
  return {
    id: `food-${slot}-${record.id}`,
    label: record.label,
    category: 'food',
    subcategory,
    amountJpy,
    confidence: record.confidence,
  }
}

// E1-E3: breakfast/lunch/dinner by tier, per leg. When a leg's lodging tier
// is ryokan_hanmeshi, dinner and breakfast are already included in the room
// rate (§2.3) and must be zeroed here to avoid double-counting.
export function legFoodCost(leg: Leg, people: number, priceData: PriceData): LineItem[] {
  const isRyokanHanmeshi = leg.lodgingTier === 'ryokan_hanmeshi'
  const lineItems: LineItem[] = []

  if (!isRyokanHanmeshi) {
    lineItems.push(mealCost('breakfast', leg.food.breakfast, people, leg.nights, priceData))
  }
  lineItems.push(mealCost('lunch', leg.food.lunch, people, leg.nights, priceData))
  if (!isRyokanHanmeshi) {
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
      amountJpy: multiplyByBasis(record.basis, record.expected, { people, uses: leg.splurgeMeals }),
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
    amountJpy: multiplyByBasis(drinksRecord.basis, drinksRecord.expected, { people, days: totalNights }),
    confidence: drinksRecord.confidence,
  })

  return { lineItems, totalJpy: sumLineItems(lineItems) }
}
