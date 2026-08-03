import { useMemo, useState } from 'react'
import { addDaysToIsoDate, findOverlappingSeasons } from '../../engine/index'
import { tripDayRole, type TripWindow } from '../../engine/tripWindow'
import type { SeasonRecord } from '../../engine/priceData'

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Six weeks of dates covering the month, padded from the adjacent months so
// every row is a full week.
function monthGrid(year: number, monthIndex: number): Array<{ iso: string; inMonth: boolean; day: number }> {
  const first = new Date(Date.UTC(year, monthIndex, 1))
  const gridStart = addDaysToIsoDate(first.toISOString().slice(0, 10), -first.getUTCDay())

  return Array.from({ length: 42 }, (_, i) => {
    const iso = addDaysToIsoDate(gridStart, i)
    const d = new Date(`${iso}T00:00:00Z`)
    return { iso, inMonth: d.getUTCMonth() === monthIndex, day: d.getUTCDate() }
  })
}

const ROLE_LABEL: Record<string, string> = {
  outbound_transit: 'In the air',
  arrival: 'Land in Japan',
  full: 'Full day',
  departure: 'Fly home',
  return_transit: 'Still travelling',
}

export function TripCalendar({
  departHomeDate,
  arriveHomeDate,
  window: tripWindow,
  seasons,
  onPickDate,
}: {
  departHomeDate: string
  arriveHomeDate: string
  window: TripWindow | null
  seasons: SeasonRecord[]
  onPickDate: (iso: string) => void
}) {
  // Open on the outbound month when one is set, otherwise the month after
  // next — nobody books a Japan trip for this week.
  const initial = useMemo(() => {
    const anchor = departHomeDate || addDaysToIsoDate(new Date().toISOString().slice(0, 10), 60)
    const d = new Date(`${anchor}T00:00:00Z`)
    return { year: d.getUTCFullYear(), monthIndex: d.getUTCMonth() }
  }, [departHomeDate])

  const [view, setView] = useState(initial)

  const shiftMonth = (delta: number) => {
    setView((v) => {
      const next = new Date(Date.UTC(v.year, v.monthIndex + delta, 1))
      return { year: next.getUTCFullYear(), monthIndex: next.getUTCMonth() }
    })
  }

  const cells = monthGrid(view.year, view.monthIndex)

  return (
    <div className="trip-calendar">
      <div className="trip-calendar__header">
        <button type="button" onClick={() => shiftMonth(-12)} aria-label="Previous year">
          «
        </button>
        <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month">
          ‹
        </button>
        <span className="trip-calendar__month" aria-live="polite">
          {MONTHS[view.monthIndex]} {view.year}
        </span>
        <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month">
          ›
        </button>
        <button type="button" onClick={() => shiftMonth(12)} aria-label="Next year">
          »
        </button>
      </div>

      <div className="trip-calendar__weekdays" aria-hidden="true">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>

      <div className="trip-calendar__grid" role="grid" aria-label="Pick your outbound and return dates">
        {cells.map(({ iso, inMonth, day }) => {
          const role = tripWindow ? tripDayRole(iso, tripWindow, departHomeDate, arriveHomeDate) : 'outside'
          const daySeasons = findOverlappingSeasons(iso, 1, seasons)
          const peak = daySeasons.find((s) => s.severity === 'peak' || s.severity === 'elevated')
          const sweet = daySeasons.find((s) => s.severity === 'sweet_spot')
          const isEndpoint = iso === departHomeDate || iso === arriveHomeDate

          const classes = [
            'trip-calendar__day',
            `trip-calendar__day--${role}`,
            inMonth ? '' : 'trip-calendar__day--muted',
            isEndpoint ? 'trip-calendar__day--endpoint' : '',
            peak ? 'trip-calendar__day--peak' : '',
            !peak && sweet ? 'trip-calendar__day--sweet' : '',
          ]
            .filter(Boolean)
            .join(' ')

          const seasonNote = daySeasons.length > 0 ? ` · ${daySeasons.map((s) => s.label).join(', ')}` : ''
          const roleNote = role !== 'outside' ? ` · ${ROLE_LABEL[role]}` : ''

          return (
            <button key={iso} type="button" className={classes} onClick={() => onPickDate(iso)} title={`${iso}${roleNote}${seasonNote}`}>
              <span className="trip-calendar__day-number">{day}</span>
              {iso === departHomeDate && <span className="trip-calendar__flag">out</span>}
              {iso === arriveHomeDate && <span className="trip-calendar__flag">home</span>}
            </button>
          )
        })}
      </div>

      <ul className="trip-calendar__legend">
        <li>
          <span className="trip-calendar__swatch trip-calendar__swatch--transit" /> In the air
        </li>
        <li>
          <span className="trip-calendar__swatch trip-calendar__swatch--partial" /> Partial day
        </li>
        <li>
          <span className="trip-calendar__swatch trip-calendar__swatch--full" /> Full day
        </li>
        <li>
          <span className="trip-calendar__swatch trip-calendar__swatch--peak" /> Peak / busy season
        </li>
        <li>
          <span className="trip-calendar__swatch trip-calendar__swatch--sweet" /> Better-value season
        </li>
      </ul>
    </div>
  )
}
