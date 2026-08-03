import { useMemo } from 'react'
import { computeBudget, computeGuidance } from '../../engine/index'
import { priceData } from '../data'
import { useTripConfig } from '../state/TripConfigContext'

// §5.2/§5.3: a non-blocking guidance panel — advisory only, never gates
// the running total. Every rule runs off the deterministic budget on each
// config change. The full rule set is shown here, including the seasonal
// scarcity warning: it no longer runs a Monte Carlo simulation, so there
// is nothing expensive left to hold back from the UI.
export function GuidancePanel() {
  const { config } = useTripConfig()

  const messages = useMemo(() => {
    try {
      const budget = computeBudget(config, priceData)
      return computeGuidance(config, priceData, budget)
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
