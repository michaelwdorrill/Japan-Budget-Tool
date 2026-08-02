import { useMemo } from 'react'
import { computeBudget, jpyToUsd } from '../../engine/index'
import { priceData } from '../data'
import { useTripConfig } from '../state/TripConfigContext'
import { useDebouncedMonteCarlo } from '../state/useDebouncedMonteCarlo'
import { currencySymbolFor, formatCurrency } from '../currency'

function formatJpy(amountJpy: number): string {
  return `¥${Math.round(amountJpy).toLocaleString('en-US')}`
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
  const currencyCode = config.money.currencyCode
  const currencySymbol = currencySymbolFor(currencyCode)
  const totalPeople = config.party.adults + config.party.children.length

  // §7: display-only opportunity cost of points used — never part of the
  // budget total, shown separately so it's never conflated with real spend.
  const pointsOpportunityCost =
    deterministic.pointsOpportunityCostUsd > 0 ? (
      <p className="running-total__points">
        {formatCurrency(deterministic.pointsOpportunityCostUsd, currencyCode)} points opportunity cost (not counted toward the total).
      </p>
    ) : null

  if (!monteCarlo) {
    // First render before the debounced Monte Carlo run has landed: show the
    // deterministic expected value so the corner is never blank.
    const perPersonAmount = jpyToUsd(deterministic.totalJpyPerPerson, jpyPerUsd, { cardFxFeePct })
    return (
      <div className="running-total">
        <div className="running-total__headline">
          <span className="running-total__label">Estimated total, per person</span>
          <span className="running-total__amount">{formatCurrency(perPersonAmount, currencyCode)}</span>
          <span className="running-total__jpy">
            {formatJpy(deterministic.totalJpyPerPerson)} at ¥{jpyPerUsd}/{currencySymbol} · calculating range…
          </span>
        </div>
        {pointsOpportunityCost}
      </div>
    )
  }

  const p80Amount = monteCarlo.usdPerPerson.p80
  const p80Jpy = monteCarlo.jpyPerPerson.p80
  const p50Amount = monteCarlo.usdPerPerson.p50
  const partyP80Amount = monteCarlo.usdParty.p80
  const partyP80Jpy = monteCarlo.jpyParty.p80

  return (
    <div className="running-total">
      <div className="running-total__headline">
        <span className="running-total__label">Budget to this, per person (P80)</span>
        <span className="running-total__amount">{formatCurrency(p80Amount, currencyCode)}</span>
        <span className="running-total__jpy">
          {formatJpy(p80Jpy)} at ¥{jpyPerUsd}/{currencySymbol}
          {cardFxFeePct > 0 ? ` + ${cardFxFeePct}% card fee` : ''}
        </span>
      </div>
      <p className="running-total__explainer">Roughly a 4-in-5 chance of coming in under this.</p>
      <div className="running-total__percentiles">
        <span>P10 {formatCurrency(monteCarlo.usdPerPerson.p10, currencyCode)}</span>
        <span>P50 {formatCurrency(p50Amount, currencyCode)}</span>
        <span className="running-total__percentiles--current">P80 {formatCurrency(p80Amount, currencyCode)}</span>
        <span>P90 {formatCurrency(monteCarlo.usdPerPerson.p90, currencyCode)}</span>
      </div>
      <div className="running-total__party">
        {formatCurrency(partyP80Amount, currencyCode)} ({formatJpy(partyP80Jpy)}) total for {totalPeople}{' '}
        {totalPeople === 1 ? 'person' : 'people'}
      </div>
      {pointsOpportunityCost}
      {deterministic.bracketEdgeWarnings.length > 0 && (
        <p className="running-total__warning">⚠ {deterministic.bracketEdgeWarnings.length} lodging tax bracket warning(s) — see step 3.</p>
      )}
    </div>
  )
}
