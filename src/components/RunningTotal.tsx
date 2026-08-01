import { useMemo } from 'react'
import { computeBudget, jpyToUsd } from '../../engine/index'
import { priceData } from '../data'
import { useTripConfig } from '../state/TripConfigContext'

function formatJpy(amountJpy: number): string {
  return `¥${Math.round(amountJpy).toLocaleString('en-US')}`
}

function formatUsd(amountUsd: number): string {
  return `$${amountUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

// The running total "in the corner" required by §5.3. This is the
// deterministic (expected-value) total; Monte Carlo/P80 arrives in Phase 6.
//
// §0.3 / §6: compute in JPY, display in USD, exactly once, at this
// boundary — the headline figure is USD, with the JPY amount and the FX
// rate used stated underneath, and it re-renders live as jpyPerUsd changes
// in step 7 (Money).
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

  const jpyPerUsd = config.money.jpyPerUsd
  const cardFxFeePct = config.money.cardFxFeePct
  const perPersonUsd = jpyToUsd(result.totalJpyPerPerson, jpyPerUsd, { cardFxFeePct })
  const partyUsd = jpyToUsd(result.totalJpyParty, jpyPerUsd, { cardFxFeePct })
  const totalPeople = config.party.adults + config.party.children.length

  return (
    <div className="running-total">
      <div className="running-total__headline">
        <span className="running-total__label">Estimated total, per person</span>
        <span className="running-total__amount">{formatUsd(perPersonUsd)}</span>
        <span className="running-total__jpy">
          {formatJpy(result.totalJpyPerPerson)} at ¥{jpyPerUsd}/$
          {cardFxFeePct > 0 ? ` + ${cardFxFeePct}% card fee` : ''}
        </span>
      </div>
      <div className="running-total__party">
        {formatUsd(partyUsd)} ({formatJpy(result.totalJpyParty)}) total for {totalPeople} {totalPeople === 1 ? 'person' : 'people'}
      </div>
      {result.bracketEdgeWarnings.length > 0 && (
        <p className="running-total__warning">⚠ {result.bracketEdgeWarnings.length} lodging tax bracket warning(s) — see step 3.</p>
      )}
    </div>
  )
}
