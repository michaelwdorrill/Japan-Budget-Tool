import { useMemo } from 'react'
import { computeBudget } from '../../engine/index'
import { priceData } from '../data'
import { useTripConfig } from '../state/TripConfigContext'

function formatJpy(amountJpy: number): string {
  return `¥${Math.round(amountJpy).toLocaleString('en-US')}`
}

// The running total "in the corner" required by §5.3. This is the
// deterministic (expected-value) total; Monte Carlo/P80 arrives in Phase 6.
export function RunningTotal() {
  const { config } = useTripConfig()

  const result = useMemo(() => {
    try {
      return computeBudget(config, priceData)
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  }, [config])

  if ('error' in result) {
    return (
      <div className="running-total running-total--error">
        <p>Can't price this trip yet: {result.error}</p>
      </div>
    )
  }

  return (
    <div className="running-total">
      <div className="running-total__headline">
        <span className="running-total__label">Estimated total, per person</span>
        <span className="running-total__amount">{formatJpy(result.totalJpyPerPerson)}</span>
      </div>
      <div className="running-total__party">
        {formatJpy(result.totalJpyParty)} total for {config.party.adults + config.party.children.length}{' '}
        {config.party.adults + config.party.children.length === 1 ? 'person' : 'people'}
      </div>
      {result.bracketEdgeWarnings.length > 0 && (
        <p className="running-total__warning">⚠ {result.bracketEdgeWarnings.length} lodging tax bracket warning(s) — see step 3.</p>
      )}
    </div>
  )
}
