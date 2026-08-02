import { useMemo } from 'react'
import { computeBudget, computeSensitivity, jpyToUsd } from '../../engine/index'
import { priceData } from '../data'
import { useTripConfig } from '../state/TripConfigContext'
import { useDebouncedMonteCarlo } from '../state/useDebouncedMonteCarlo'
import { computeCategorySegments, computeCityBreakdown, computeTornadoBars } from '../charts'
import { CategoryBarChart } from './CategoryBarChart'
import { CityTable } from './CityTable'
import { TornadoChart } from './TornadoChart'
import { DistributionHistogram } from './DistributionHistogram'
import { WhatIfPanel } from './WhatIfPanel'

const CITY_NAMES: Record<string, string> = Object.fromEntries(priceData.cities.map((c) => [c.id, c.name]))

// §6: the full output set beyond the running-total headline — stacked
// category bar, city table, tornado chart, distribution histogram, and the
// "what if" panel. All read-only/derived from the current config; nothing
// here writes back except the what-if panel's own scratch state.
export function OutputsPanel() {
  const { config } = useTripConfig()

  const budget = useMemo(() => {
    try {
      return computeBudget(config, priceData)
    } catch {
      return null
    }
  }, [config])

  const sensitivity = useMemo(() => {
    try {
      return computeSensitivity(config, priceData)
    } catch {
      return []
    }
  }, [config])

  const monteCarlo = useDebouncedMonteCarlo(config, priceData, budget !== null)

  if (!budget) return null

  const totalPeople = config.party.adults + config.party.children.length
  const totalNights = config.itinerary.legs.reduce((sum, leg) => sum + leg.nights, 0)
  const perDayBurnJpy = totalNights > 0 ? budget.totalJpyPerPerson / totalNights : budget.totalJpyPerPerson

  const segments = computeCategorySegments(budget, totalPeople)
  const cityRows = computeCityBreakdown(config, budget.lineItems)
  const tornadoBars = computeTornadoBars(sensitivity)

  return (
    <section className="outputs-panel">
      <h2>Where the money goes</h2>
      <CategoryBarChart segments={segments} perDayBurnJpy={perDayBurnJpy} />

      <h3>By city</h3>
      <CityTable rows={cityRows} cityNames={CITY_NAMES} />

      <h3>What moves the number most</h3>
      <TornadoChart bars={tornadoBars} />

      {monteCarlo && (
        <>
          <h3>Distribution of outcomes</h3>
          <DistributionHistogram bins={monteCarlo.histogramUsdPerPerson} percentiles={monteCarlo.usdPerPerson} />
        </>
      )}

      <h3>What if</h3>
      <WhatIfPanel
        baselineJpyPerPerson={budget.totalJpyPerPerson}
        baselineUsdPerPerson={jpyToUsd(budget.totalJpyPerPerson, config.money.jpyPerUsd, { cardFxFeePct: config.money.cardFxFeePct })}
      />
    </section>
  )
}
