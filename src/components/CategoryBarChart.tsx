import type { CategorySegment } from '../charts'

function formatJpy(amountJpy: number): string {
  return `¥${Math.round(amountJpy).toLocaleString('en-US')}`
}

// §6: "Stacked bar by category, per person, with a per-day burn rate." A
// single stacked bar (one trip, broken into categorical segments) —
// dataviz skill: fixed hue order, 2px surface gaps between segments, a
// legend since there are 2+ series, values in the legend rather than
// crammed into narrow segments (labels never fit inside a ¥3,000 sliver).
export function CategoryBarChart({ segments, perDayBurnJpy }: { segments: CategorySegment[]; perDayBurnJpy: number }) {
  if (segments.length === 0) return null

  return (
    <div className="category-bar viz-root">
      <div className="category-bar__track" role="img" aria-label="Spending by category, per person">
        {segments.map((segment) => (
          <div
            key={segment.category}
            className="category-bar__segment"
            style={{ flexGrow: segment.pct, background: `var(${segment.colorVar})` }}
            title={`${segment.label}: ${formatJpy(segment.amountJpyPerPerson)}/person (${(segment.pct * 100).toFixed(0)}%)`}
          />
        ))}
      </div>
      <ul className="category-bar__legend">
        {segments.map((segment) => (
          <li key={segment.category} className="category-bar__legend-item">
            <span className="category-bar__swatch" style={{ background: `var(${segment.colorVar})` }} />
            <span className="category-bar__legend-label">{segment.label}</span>
            <span className="category-bar__legend-amount">{formatJpy(segment.amountJpyPerPerson)}</span>
          </li>
        ))}
      </ul>
      <p className="category-bar__burn">{formatJpy(perDayBurnJpy)}/person/day, averaged across the trip.</p>
    </div>
  )
}
