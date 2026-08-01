import { useMemo } from 'react'
import { computeBudget, jpyToUsd } from '../../engine/index'
import { priceData } from '../data'
import { useTripConfig } from '../state/TripConfigContext'
import { useDebouncedMonteCarlo } from '../state/useDebouncedMonteCarlo'

function formatJpy(amountJpy: number): string {
  return `¥${Math.round(amountJpy).toLocaleString('en-US')}`
}

function formatUsd(amountUsd: number): string {
  return `$${amountUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

// The running total "in the corner" required by §5.3. Per §0.1/§6: the
// headline number is the P80 ("budget this much and you have roughly a
// 4-in-5 chance of coming in under"), in USD, with the JPY figure and FX
// rate stated underneath, and P50 shown secondarily. The P80 comes from
// the Monte Carlo roll-up (§3.3, debounced — see useDebouncedMonteCarlo);
// the deterministic expected-value total still drives the fast, per-
// keystroke error/warning checks.
export function RunningTotal() {
  const { config } = useTripConfig()

  const deterministic = useMemo(() => {
    try {
      return computeBudget(config, priceData)
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  }, [config])

  const isValid = !('error' in deterministic)
  const monteCarlo = useDebouncedMonteCarlo(config, priceData, isValid)

  if ('error' in deterministic) {
    return (
      <div className="running-total running-total--error">
        <p>Can't price this trip yet: {deterministic.error}</p>
      </div>
    )
  }

  const jpyPerUsd = config.money.jpyPerUsd
  const cardFxFeePct = config.money.cardFxFeePct
  const totalPeople = config.party.adults + config.party.children.length

  if (!monteCarlo) {
    // First render before the debounced Monte Carlo run has landed: show the
    // deterministic expected value so the corner is never blank.
    const perPersonUsd = jpyToUsd(deterministic.totalJpyPerPerson, jpyPerUsd, { cardFxFeePct })
    return (
      <div className="running-total">
        <div className="running-total__headline">
          <span className="running-total__label">Estimated total, per person</span>
          <span className="running-total__amount">{formatUsd(perPersonUsd)}</span>
          <span className="running-total__jpy">
            {formatJpy(deterministic.totalJpyPerPerson)} at ¥{jpyPerUsd}/$ · calculating range…
          </span>
        </div>
      </div>
    )
  }

  const p80Usd = monteCarlo.usdPerPerson.p80
  const p80Jpy = monteCarlo.jpyPerPerson.p80
  const p50Usd = monteCarlo.usdPerPerson.p50
  const partyP80Usd = monteCarlo.usdParty.p80
  const partyP80Jpy = monteCarlo.jpyParty.p80

  return (
    <div className="running-total">
      <div className="running-total__headline">
        <span className="running-total__label">Budget to this, per person (P80)</span>
        <span className="running-total__amount">{formatUsd(p80Usd)}</span>
        <span className="running-total__jpy">
          {formatJpy(p80Jpy)} at ¥{jpyPerUsd}/$
          {cardFxFeePct > 0 ? ` + ${cardFxFeePct}% card fee` : ''}
        </span>
      </div>
      <p className="running-total__explainer">Roughly a 4-in-5 chance of coming in under this.</p>
      <div className="running-total__percentiles">
        <span>P10 {formatUsd(monteCarlo.usdPerPerson.p10)}</span>
        <span>P50 {formatUsd(p50Usd)}</span>
        <span className="running-total__percentiles--current">P80 {formatUsd(p80Usd)}</span>
        <span>P90 {formatUsd(monteCarlo.usdPerPerson.p90)}</span>
      </div>
      <div className="running-total__party">
        {formatUsd(partyP80Usd)} ({formatJpy(partyP80Jpy)}) total for {totalPeople} {totalPeople === 1 ? 'person' : 'people'}
      </div>
      {deterministic.bracketEdgeWarnings.length > 0 && (
        <p className="running-total__warning">⚠ {deterministic.bracketEdgeWarnings.length} lodging tax bracket warning(s) — see step 3.</p>
      )}
    </div>
  )
}
