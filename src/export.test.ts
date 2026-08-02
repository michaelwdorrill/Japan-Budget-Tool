import { describe, expect, it } from 'vitest'
import { lineItemsToCsv, tripConfigToJson } from './export'
import { defaultTripConfig } from './state/defaultTripConfig'
import type { LineItem } from '../engine/lineItem'

describe('tripConfigToJson', () => {
  it('round-trips a TripConfig through JSON.parse', () => {
    const config = defaultTripConfig()
    const json = tripConfigToJson(config)
    expect(JSON.parse(json)).toEqual(config)
  })
})

describe('lineItemsToCsv', () => {
  it('emits a header row and one row per line item', () => {
    const items: LineItem[] = [
      { id: 'a', label: 'Business hotel, Tokyo', category: 'lodging', subcategory: 'B1', cityId: 'tokyo', lowJpy: 8000, amountJpy: 10000, highJpy: 15000, confidence: 'high' },
    ]
    const csv = lineItemsToCsv(items)
    const lines = csv.split('\n')
    expect(lines[0]).toBe('category,subcategory,cityId,label,confidence,lowJpy,amountJpy,highJpy')
    expect(lines[1]).toBe('lodging,B1,tokyo,Business hotel, Tokyo,high,8000,10000,15000'.replace('Business hotel, Tokyo', '"Business hotel, Tokyo"'))
  })

  it('quotes labels containing commas and escapes embedded quotes', () => {
    const items: LineItem[] = [
      { id: 'a', label: 'A "special" meal, deluxe', category: 'food', subcategory: 'E4', lowJpy: 1, amountJpy: 2, highJpy: 3, confidence: 'low' },
    ]
    const csv = lineItemsToCsv(items)
    expect(csv.split('\n')[1]).toBe('food,E4,,"A ""special"" meal, deluxe",low,1,2,3')
  })

  it('leaves cityId blank for line items with no city', () => {
    const items: LineItem[] = [
      { id: 'a', label: 'Departure tax', category: 'getting_there', subcategory: 'A3', lowJpy: 3000, amountJpy: 3000, highJpy: 3000, confidence: 'high' },
    ]
    const csv = lineItemsToCsv(items)
    expect(csv.split('\n')[1]).toBe('getting_there,A3,,Departure tax,high,3000,3000,3000')
  })
})
