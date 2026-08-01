import type { PriceRecord } from './price'

export function findPrice<T>(records: T[], predicate: (record: T) => boolean, description: string): T {
  const match = records.find(predicate)
  if (!match) {
    throw new Error(`no price record found for ${description}`)
  }
  return match
}

export function findPriceById(prices: PriceRecord[], id: string): PriceRecord {
  return findPrice(prices, (record) => record.id === id, `id "${id}"`)
}
