import type { TripConfig } from '../engine/trip'
import type { LineItem } from '../engine/lineItem'

// §6 Export: "JSON (round-trips back into the app), CSV of line items, and
// a print stylesheet." Pure formatting helpers — no DOM — so they're
// testable without jsdom.

export function tripConfigToJson(config: TripConfig): string {
  return JSON.stringify(config, null, 2)
}

function csvField(value: string | number): string {
  const str = String(value)
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

const CSV_HEADER = ['category', 'subcategory', 'cityId', 'label', 'confidence', 'lowJpy', 'amountJpy', 'highJpy']

export function lineItemsToCsv(lineItems: LineItem[]): string {
  const rows = lineItems.map((item) =>
    [item.category, item.subcategory, item.cityId ?? '', item.label, item.confidence, item.lowJpy, item.amountJpy, item.highJpy]
      .map(csvField)
      .join(','),
  )
  return [CSV_HEADER.join(','), ...rows].join('\n')
}

export function downloadTextFile(filename: string, contents: string, mimeType: string): void {
  const blob = new Blob([contents], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
