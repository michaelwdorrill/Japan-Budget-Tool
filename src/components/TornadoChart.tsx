import type { TornadoBar } from '../charts'

function formatJpy(amountJpy: number): string {
  return `¥${Math.round(amountJpy).toLocaleString('en-US')}`
}

// §3.4/§6: "Tornado chart (sensitivity)." Diverging bars around a
// per-person baseline: each input moved one notch down (blue, cheaper) or
// up (red, more expensive), sorted by impact — the ordering the engine
// already computes *is* the product's advice on which decisions matter.
export function TornadoChart({ bars }: { bars: TornadoBar[] }) {
  if (bars.length === 0) return null

  return (
    <div className="tornado-chart viz-root">
      <div className="tornado-chart__legend">
        <span className="tornado-chart__legend-item">
          <span className="tornado-chart__swatch tornado-chart__swatch--down" /> Cheaper
        </span>
        <span className="tornado-chart__legend-item">
          <span className="tornado-chart__swatch tornado-chart__swatch--up" /> More expensive
        </span>
      </div>
      <ul className="tornado-chart__rows">
        {bars.map((bar) => (
          <li key={bar.id} className="tornado-chart__row">
            <span className="tornado-chart__label">{bar.label}</span>
            <span className="tornado-chart__track">
              <span className="tornado-chart__half tornado-chart__half--down">
                <span
                  className="tornado-chart__bar tornado-chart__bar--down"
                  style={{ width: `${bar.downFraction * 100}%` }}
                  title={`${bar.label}, moved down: ${formatJpy(bar.lowJpyPerPerson)}/person`}
                />
              </span>
              <span className="tornado-chart__midline" />
              <span className="tornado-chart__half tornado-chart__half--up">
                <span
                  className="tornado-chart__bar tornado-chart__bar--up"
                  style={{ width: `${bar.upFraction * 100}%` }}
                  title={`${bar.label}, moved up: ${formatJpy(bar.highJpyPerPerson)}/person`}
                />
              </span>
            </span>
            <span className="tornado-chart__values">
              {formatJpy(bar.lowJpyPerPerson)} – {formatJpy(bar.highJpyPerPerson)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
