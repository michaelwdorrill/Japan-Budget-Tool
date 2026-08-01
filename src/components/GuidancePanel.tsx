import { useMemo } from 'react'
import { computeBudget, computeGuidance } from '../../engine/index'
import { priceData } from '../data'
import { useTripConfig } from '../state/TripConfigContext'

// §5.2/§5.3: a non-blocking guidance panel — advisory only, never gates
// the running total. Runs off the deterministic budget on every config
// change (cheap); the season-shift P80 counterfactual is skipped here
// since it costs two 10,000-trial Monte Carlo runs (see the CLI for the
// full version, budget-cli.ts).
export function GuidancePanel() {
  const { config } = useTripConfig()

  const messages = useMemo(() => {
    try {
      const budget = computeBudget(config, priceData)
      return computeGuidance(config, priceData, budget, { includeSeasonShiftCounterfactual: false })
    } catch {
      return []
    }
  }, [config])

  if (messages.length === 0) return null

  return (
    <div className="guidance-panel">
      <h3 className="guidance-panel__title">Guidance</h3>
      <ul className="guidance-panel__list">
        {messages.map((note) => (
          <li key={note.ruleId + note.message} className={`guidance-panel__item guidance-panel__item--${note.severity}`}>
            {note.message}
          </li>
        ))}
      </ul>
    </div>
  )
}
