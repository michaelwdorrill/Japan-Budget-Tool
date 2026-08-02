import { useMemo, useState } from 'react'
import { computeBudget, jpyToUsd, shiftLodgingTier, shiftNights, shiftToNearestShoulderSeason } from '../../engine/index'
import { priceData } from '../data'
import { useTripConfig } from '../state/TripConfigContext'

function formatUsd(amountUsd: number): string {
  return `$${amountUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

interface WhatIfRow {
  id: string
  label: string
  deltaUsdPerPerson: number | null // null = not applicable to this trip
}

// §6: "'What if' panel: FX slider, season shift, one fewer night, one tier
// down on lodging — each showing the delta live." Every row recomputes the
// deterministic budget against a config clone; nothing here writes back to
// the real trip.
export function WhatIfPanel({ baselineJpyPerPerson, baselineUsdPerPerson }: { baselineJpyPerPerson: number; baselineUsdPerPerson: number }) {
  const { config } = useTripConfig()
  const [fxSliderPct, setFxSliderPct] = useState(0) // -20..+20, % change to jpyPerUsd

  const rows: WhatIfRow[] = useMemo(() => {
    const results: WhatIfRow[] = []

    try {
      const fewerNightsConfig = shiftNights(config, -1)
      const fewerNightsUsd = jpyToUsd(computeBudget(fewerNightsConfig, priceData).totalJpyPerPerson, config.money.jpyPerUsd, {
        cardFxFeePct: config.money.cardFxFeePct,
      })
      results.push({ id: 'fewer_nights', label: 'One fewer night', deltaUsdPerPerson: fewerNightsUsd - baselineUsdPerPerson })
    } catch {
      results.push({ id: 'fewer_nights', label: 'One fewer night', deltaUsdPerPerson: null })
    }

    try {
      const cheaperLodgingConfig = shiftLodgingTier(config, -1, priceData)
      const cheaperLodgingUsd = jpyToUsd(computeBudget(cheaperLodgingConfig, priceData).totalJpyPerPerson, config.money.jpyPerUsd, {
        cardFxFeePct: config.money.cardFxFeePct,
      })
      results.push({ id: 'lodging_tier_down', label: 'One tier down on lodging', deltaUsdPerPerson: cheaperLodgingUsd - baselineUsdPerPerson })
    } catch {
      results.push({ id: 'lodging_tier_down', label: 'One tier down on lodging', deltaUsdPerPerson: null })
    }

    try {
      const budget = computeBudget(config, priceData)
      const overlap = budget.seasonOverlaps[0]
      if (overlap) {
        const shiftedConfig = shiftToNearestShoulderSeason(config, priceData, overlap.season.startMonthDay, budget.referenceDate)
        if (shiftedConfig) {
          const shiftedUsd = jpyToUsd(computeBudget(shiftedConfig, priceData).totalJpyPerPerson, config.money.jpyPerUsd, {
            cardFxFeePct: config.money.cardFxFeePct,
          })
          results.push({ id: 'season_shift', label: 'Shift to the nearest shoulder season', deltaUsdPerPerson: shiftedUsd - baselineUsdPerPerson })
        } else {
          results.push({ id: 'season_shift', label: 'Shift to the nearest shoulder season', deltaUsdPerPerson: null })
        }
      } else {
        results.push({ id: 'season_shift', label: 'Shift to the nearest shoulder season', deltaUsdPerPerson: null })
      }
    } catch {
      results.push({ id: 'season_shift', label: 'Shift to the nearest shoulder season', deltaUsdPerPerson: null })
    }

    return results
  }, [config, baselineUsdPerPerson])

  const slidFxRate = config.money.jpyPerUsd * (1 + fxSliderPct / 100)
  const fxUsd = jpyToUsd(baselineJpyPerPerson, slidFxRate, { cardFxFeePct: config.money.cardFxFeePct })
  const fxDelta = fxUsd - baselineUsdPerPerson

  return (
    <div className="what-if-panel viz-root">
      <div className="what-if-panel__row what-if-panel__row--slider">
        <label htmlFor="what-if-fx-slider">
          FX rate: ¥{slidFxRate.toFixed(1)}/$ ({fxSliderPct > 0 ? '+' : ''}
          {fxSliderPct}%)
        </label>
        <input
          id="what-if-fx-slider"
          type="range"
          min={-20}
          max={20}
          step={1}
          value={fxSliderPct}
          onChange={(e) => setFxSliderPct(Number(e.target.value))}
        />
        <DeltaTag deltaUsdPerPerson={fxDelta} />
      </div>

      {rows.map((row) => (
        <div key={row.id} className="what-if-panel__row">
          <span className="what-if-panel__label">{row.label}</span>
          <DeltaTag deltaUsdPerPerson={row.deltaUsdPerPerson} />
        </div>
      ))}
    </div>
  )
}

function DeltaTag({ deltaUsdPerPerson }: { deltaUsdPerPerson: number | null }) {
  if (deltaUsdPerPerson === null) {
    return <span className="what-if-panel__delta what-if-panel__delta--na">not applicable</span>
  }
  if (Math.abs(deltaUsdPerPerson) < 0.5) {
    return <span className="what-if-panel__delta what-if-panel__delta--flat">no change</span>
  }
  const isIncrease = deltaUsdPerPerson > 0
  return (
    <span className={`what-if-panel__delta ${isIncrease ? 'what-if-panel__delta--up' : 'what-if-panel__delta--down'}`}>
      {isIncrease ? '+' : '−'}
      {formatUsd(Math.abs(deltaUsdPerPerson))}/person
    </span>
  )
}
