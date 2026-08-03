import { useEffect, useState } from 'react'
import { computeTripWindow, type DayPart } from '../../engine/index'
import { useTripConfig } from '../state/TripConfigContext'
import { priceData } from '../data'
import { TripCalendar } from '../components/TripCalendar'

// Westbound across the date line normally lands the next calendar day;
// eastbound normally lands the same day it departed. From the US east
// coast to Tokyo that is the usual shape whether the flight is direct or
// takes one connection — a connection makes the day longer, not later.
const DEFAULT_OUTBOUND_TRAVEL_DAYS = 1
const DEFAULT_RETURN_TRAVEL_DAYS = 0

const DAY_PARTS: Array<{ value: DayPart; label: string }> = [
  { value: 'morning', label: 'Morning' },
  { value: 'midday', label: 'Midday' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
]

function formatLongDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function StepWhoAndWhen() {
  const { config, updateConfig } = useTripConfig()
  const { party, timing } = config

  // §5.3 follow-up: "semi calendar based" — set the days you leave home and
  // arrive back, and let the tool work out the Japan-side window, instead
  // of guessing an in-country start date and night count directly. Kept as
  // component-local scratch state (not part of TripConfig/the URL): only
  // the *result* — timing.startDate and timing.nights — is real trip state;
  // the depart/return dates and travel-day assumptions are just how this
  // step arrives at it, same spirit as the itinerary presets that seed
  // fields and then get out of the way.
  const [calendarMode, setCalendarMode] = useState(false)
  const [departDate, setDepartDate] = useState('')
  const [returnDate, setReturnDate] = useState('')
  const [outboundTravelDays, setOutboundTravelDays] = useState(DEFAULT_OUTBOUND_TRAVEL_DAYS)
  const [returnTravelDays, setReturnTravelDays] = useState(DEFAULT_RETURN_TRAVEL_DAYS)
  const [arrivalPart, setArrivalPart] = useState<DayPart>('afternoon')
  const [departurePart, setDeparturePart] = useState<DayPart>('morning')

  const tripWindow =
    departDate && returnDate
      ? computeTripWindow({
          departHomeDate: departDate,
          arriveHomeDate: returnDate,
          outboundTransitDays: outboundTravelDays,
          returnTransitDays: returnTravelDays,
          arrivalPart,
          departurePart,
        })
      : null

  // Clicking the calendar sets the outbound date first, then the return.
  // A third click (or any click before the current outbound) starts over,
  // which is the least surprising behaviour for a two-endpoint picker.
  const handlePickDate = (iso: string) => {
    if (!departDate || (departDate && returnDate) || iso < departDate) {
      setDepartDate(iso)
      setReturnDate('')
      return
    }
    setReturnDate(iso)
  }

  useEffect(() => {
    if (!calendarMode || !tripWindow?.valid) return
    updateConfig((c) => ({
      ...c,
      timing: { startDate: tripWindow.japanArrivalDate, season: null, nights: tripWindow.lodgingNights },
    }))
    // Only the derived window should trigger the write-back; config is
    // written here, not read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarMode, tripWindow?.japanArrivalDate, tripWindow?.lodgingNights, tripWindow?.valid])

  const setAdults = (adults: number) => {
    updateConfig((c) => ({ ...c, party: { ...c.party, adults: Math.max(1, adults) } }))
  }

  const setChildAge = (index: number, age: number) => {
    updateConfig((c) => {
      const children = [...c.party.children]
      children[index] = { age: Math.max(0, Math.min(17, age)) }
      return { ...c, party: { ...c.party, children } }
    })
  }

  const addChild = () => {
    updateConfig((c) => ({ ...c, party: { ...c.party, children: [...c.party.children, { age: 8 }] } }))
  }

  const removeChild = (index: number) => {
    updateConfig((c) => ({ ...c, party: { ...c.party, children: c.party.children.filter((_, i) => i !== index) } }))
  }

  const totalPeople = party.adults + party.children.length
  const suggestedRooms = Math.ceil(totalPeople / 2)

  const setRooms = (rooms: number) => {
    updateConfig((c) => ({ ...c, party: { ...c.party, rooms: Math.max(1, rooms) } }))
  }

  const setNights = (nights: number) => {
    updateConfig((c) => ({ ...c, timing: { ...c.timing, nights: Math.max(1, nights) } }))
  }

  const setStartDate = (value: string) => {
    updateConfig((c) => ({ ...c, timing: { ...c.timing, startDate: value || null, season: value ? null : c.timing.season } }))
  }

  const setSeason = (value: string) => {
    updateConfig((c) => ({ ...c, timing: { ...c.timing, season: value || null, startDate: value ? null : c.timing.startDate } }))
  }

  return (
    <div className="step-form">
      <fieldset>
        <legend>Party</legend>
        <label>
          Adults
          <input type="number" min={1} value={party.adults} onChange={(e) => setAdults(Number(e.target.value))} />
        </label>

        <div className="children-list">
          {party.children.map((child, i) => (
            <div key={i} className="children-list__row">
              <label>
                Child {i + 1} age
                <input type="number" min={0} max={17} value={child.age} onChange={(e) => setChildAge(i, Number(e.target.value))} />
              </label>
              <button type="button" onClick={() => removeChild(i)} aria-label={`Remove child ${i + 1}`}>
                Remove
              </button>
            </div>
          ))}
          <button type="button" onClick={addChild}>
            + Add child
          </button>
        </div>
        <p className="field-note">Fares: free under 6, half price 6-11. Lodging occupancy limits are strict in Japan.</p>

        <label>
          Rooms
          <input type="number" min={1} value={party.rooms} onChange={(e) => setRooms(Number(e.target.value))} />
        </label>
        <p className="field-note">Suggested default for {totalPeople} people: {suggestedRooms}.</p>
      </fieldset>

      <fieldset>
        <legend>When</legend>

        <label className="calendar-toggle">
          <input type="checkbox" checked={calendarMode} onChange={(e) => setCalendarMode(e.target.checked)} />
          Set the days I leave and return home, and calculate the window
        </label>

        {calendarMode ? (
          <div className="calendar-window">
            <p className="field-note">
              {!departDate
                ? 'Click the day you fly out of home.'
                : !returnDate
                  ? 'Now click the day you land back home.'
                  : 'Click any earlier day to start over.'}
            </p>

            <TripCalendar
              departHomeDate={departDate}
              arriveHomeDate={returnDate}
              window={tripWindow}
              seasons={priceData.seasons}
              onPickDate={handlePickDate}
            />

            <div className="calendar-window__flights">
              <label>
                Land in Japan
                <select value={arrivalPart} onChange={(e) => setArrivalPart(e.target.value as DayPart)}>
                  {DAY_PARTS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Fly home
                <select value={departurePart} onChange={(e) => setDeparturePart(e.target.value as DayPart)}>
                  {DAY_PARTS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Outbound days in transit
                <input
                  type="number"
                  min={0}
                  max={3}
                  value={outboundTravelDays}
                  onChange={(e) => setOutboundTravelDays(Math.max(0, Number(e.target.value)))}
                />
              </label>
              <label>
                Return days in transit
                <input
                  type="number"
                  min={0}
                  max={3}
                  value={returnTravelDays}
                  onChange={(e) => setReturnTravelDays(Math.max(0, Number(e.target.value)))}
                />
              </label>
            </div>
            <p className="field-note">
              A DC-to-Tokyo flight crosses the date line and lands the next calendar day, so 1 outbound day in transit; the
              flight home gains it back and usually lands the same day, so 0. That holds for a direct flight or one with a
              single connection — a connection makes the journey longer, not later. Change these once you have real flight
              times.
            </p>

            {tripWindow?.valid && (
              <div className="trip-window-summary">
                <p className="trip-window-summary__line">
                  Land <strong>{formatLongDate(tripWindow.japanArrivalDate)}</strong> ({arrivalPart})
                </p>
                <p className="trip-window-summary__line">
                  Fly home <strong>{formatLongDate(tripWindow.japanDepartureDate)}</strong> ({departurePart})
                </p>
                <div className="trip-window-summary__figures">
                  <span>
                    <strong>{tripWindow.lodgingNights}</strong> nights of lodging
                  </span>
                  <span>
                    <strong>{tripWindow.fullDays}</strong> full days
                  </span>
                  <span className="trip-window-summary__usable">
                    <strong>~{tripWindow.usableDays}</strong> usable days
                  </span>
                </div>
                <p className="field-note">
                  You pay for {tripWindow.lodgingNights} nights, but only {tripWindow.fullDays} of those days are untouched by a
                  flight. Landing in the {arrivalPart} and flying home in the {departurePart} leaves roughly{' '}
                  {tripWindow.usableDays} days you can actually plan into — that is the number to fit your itinerary into on
                  step 2, not {tripWindow.lodgingNights}.
                </p>
              </div>
            )}
            {tripWindow && !tripWindow.valid && <p className="field-note field-note--warning">{tripWindow.problem}</p>}
          </div>
        ) : (
          <>
            <label>
              Exact start date
              <input type="date" value={timing.startDate ?? ''} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <p className="field-note">— or —</p>
            <label>
              Season
              <select value={timing.season ?? ''} onChange={(e) => setSeason(e.target.value)}>
                <option value="">(none selected)</option>
                {priceData.seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        <label>
          Nights (total)
          <input
            type="number"
            min={1}
            value={timing.nights}
            disabled={calendarMode}
            onChange={(e) => setNights(Number(e.target.value))}
          />
        </label>
        {calendarMode && <p className="field-note">Calculated from your round-trip dates above.</p>}
      </fieldset>
    </div>
  )
}
