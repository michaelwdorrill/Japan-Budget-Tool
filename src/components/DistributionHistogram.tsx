import type { HistogramBin, Percentiles } from '../../engine/index'

function formatUsd(amountUsd: number): string {
  return `$${amountUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

const MARKERS: Array<{ key: keyof Percentiles; label: string }> = [
  { key: 'p10', label: 'P10' },
  { key: 'p50', label: 'P50' },
  { key: 'p80', label: 'P80' },
  { key: 'p90', label: 'P90' },
]

// §6: "Distribution histogram with P10/P50/P80/P90 markers." A single
// series (magnitude, sequential blue) — no legend needed for the bars
// themselves; the four percentile lines are labeled directly since there
// are only four, well within the "label selectively" rule.
export function DistributionHistogram({ bins, percentiles }: { bins: HistogramBin[]; percentiles: Percentiles }) {
  if (bins.length === 0) return null

  const min = bins[0].x0
  const max = bins[bins.length - 1].x1
  const range = max - min || 1
  const maxCount = Math.max(...bins.map((b) => b.count), 1)

  return (
    <div className="histogram viz-root">
      <div className="histogram__plot">
        {bins.map((bin, i) => (
          <div
            key={i}
            className="histogram__bar"
            style={{ height: `${(bin.count / maxCount) * 100}%` }}
            title={`${formatUsd(bin.x0)}–${formatUsd(bin.x1)}: ${bin.count} trials`}
          />
        ))}
        {MARKERS.map(({ key, label }, i) => {
          const value = percentiles[key]
          const leftPct = Math.min(100, Math.max(0, ((value - min) / range) * 100))
          return (
            <div
              key={key}
              className={`histogram__marker${i % 2 === 1 ? ' histogram__marker--low' : ''}`}
              style={{ left: `${leftPct}%` }}
            >
              <span className="histogram__marker-line" />
              <span className="histogram__marker-label">
                {label} {formatUsd(value)}
              </span>
            </div>
          )
        })}
      </div>
      <div className="histogram__axis">
        <span>{formatUsd(min)}</span>
        <span>{formatUsd(max)}</span>
      </div>
    </div>
  )
}
