import { useEffect, useState } from 'react'
import { addDaysToIsoDate, daysBetweenIsoDates } from '../../engine/index'
import { useTripConfig } from '../state/TripConfigContext'
import { priceData } from '../data'

const DEFAULT_OUTBOUND_TRAVEL_DAYS = 1 // overnight flight + crossing the date line westbound
const DEFAULT_RETURN_TRAVEL_DAYS = 0 // eastbound gains hours back; typically lands the same calendar day

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

  const japanArrivalDate = departDate ? addDaysToIsoDate(departDate, outboundTravelDays) : null
  const japanDepartureDate = returnDate ? addDaysToIsoDate(returnDate, -returnTravelDays) : null
  const calendarNights =
    japanArrivalDate && japanDepartureDate ? daysBetweenIsoDates(japanArrivalDate, japanDepartureDate) : null

  useEffect(() => {
    if (!calendarMode || !japanArrivalDate || calendarNights === null || calendarNights < 1) return
    updateConfig((c) => ({ ...c, timing: { startDate: japanArrivalDate, season: null, nights: calendarNights } }))
    // Only the calendar inputs should trigger this recompute — config is
    // the thing being written, not read, here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarMode, japanArrivalDate, calendarNights])

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
            <label>
              Leave home
              <input type="date" value={departDate} onChange={(e) => setDepartDate(e.target.value)} />
            </label>
            <label>
              Arrive back home
              <input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
            </label>

            <div className="calendar-window__assumptions">
              <label>
                Outbound travel days
                <input
                  type="number"
                  min={0}
                  max={3}
                  value={outboundTravelDays}
                  onChange={(e) => setOutboundTravelDays(Math.max(0, Number(e.target.value)))}
                />
              </label>
              <label>
                Return travel days
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
              Days lost to the flight itself and crossing the date line — the defaults (1 outbound, 0 return) are a rough
              typical for a US–Japan trip; adjust to match your actual itinerary once you have flights booked.
            </p>

            {japanArrivalDate && japanDepartureDate && calendarNights !== null && calendarNights >= 1 && (
              <p className="calendar-window__summary">
                Arrive in Japan <strong>{japanArrivalDate}</strong>, depart <strong>{japanDepartureDate}</strong> —{' '}
                <strong>
                  {calendarNights} night{calendarNights === 1 ? '' : 's'}
                </strong>{' '}
                to fit everything into (step 2).
              </p>
            )}
            {calendarNights !== null && calendarNights < 1 && (
              <p className="field-note field-note--warning">
                That window leaves no nights in Japan — check your dates or the travel-day assumptions above.
              </p>
            )}
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
