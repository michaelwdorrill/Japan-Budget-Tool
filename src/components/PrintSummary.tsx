import { useMemo } from 'react'
import { computeBudget, jpyToUsd } from '../../engine/index'
import type { Category } from '../../engine/price'
import { priceData } from '../data'
import { useTripConfig } from '../state/TripConfigContext'

function formatJpy(amountJpy: number): string {
  return `¥${Math.round(amountJpy).toLocaleString('en-US')}`
}

function formatUsd(amountUsd: number): string {
  return `$${amountUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

const CATEGORY_LABELS: Record<Category, string> = {
  getting_there: 'Getting there',
  lodging: 'Lodging',
  intercity_transport: 'Intercity transport',
  local_transport: 'Local transport',
  food: 'Food',
  activities: 'Activities and admissions',
  connectivity: 'Connectivity and services',
  shopping: 'Shopping and gifts',
  reserves: 'Reserves',
}

const CATEGORY_ORDER: Category[] = [
  'getting_there',
  'lodging',
  'intercity_transport',
  'local_transport',
  'food',
  'activities',
  'connectivity',
  'shopping',
  'reserves',
]

// §6: "a print stylesheet that produces a clean one-page summary." Hidden
// on screen (index.css), shown only under @media print — the wizard chrome
// (step nav, buttons, share link, export panel) is hidden there instead.
export function PrintSummary() {
  const { config } = useTripConfig()

  const budget = useMemo(() => {
    try {
      return computeBudget(config, priceData)
    } catch {
      return null
    }
  }, [config])

  if (!budget) return null

  const jpyPerUsd = config.money.jpyPerUsd
  const cardFxFeePct = config.money.cardFxFeePct
  const totalPeople = config.party.adults + config.party.children.length
  const totalUsd = jpyToUsd(budget.totalJpyParty, jpyPerUsd, { cardFxFeePct })
  const perPersonUsd = jpyToUsd(budget.totalJpyPerPerson, jpyPerUsd, { cardFxFeePct })

  return (
    <div className="print-summary">
      {/* The page's <h1> (App.tsx) sits outside .wizard, so it's already
          visible under print — no need to repeat it here. */}
      <p className="print-summary__meta">
        Reference date: {budget.referenceDate} · {totalPeople} {totalPeople === 1 ? 'person' : 'people'} · ¥{jpyPerUsd}/$
      </p>

      <table className="print-summary__table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Amount (JPY)</th>
          </tr>
        </thead>
        <tbody>
          {CATEGORY_ORDER.map((category) => (
            <tr key={category}>
              <td>{CATEGORY_LABELS[category]}</td>
              <td>{formatJpy(budget.totalsByCategory[category])}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total, party</td>
            <td>
              {formatJpy(budget.totalJpyParty)} ({formatUsd(totalUsd)})
            </td>
          </tr>
          <tr>
            <td>Total, per person</td>
            <td>
              {formatJpy(budget.totalJpyPerPerson)} ({formatUsd(perPersonUsd)})
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
