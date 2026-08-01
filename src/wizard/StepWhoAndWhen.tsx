import { useTripConfig } from '../state/TripConfigContext'
import { priceData } from '../data'

export function StepWhoAndWhen() {
  const { config, updateConfig } = useTripConfig()
  const { party, timing } = config

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

        <label>
          Nights (total)
          <input type="number" min={1} value={timing.nights} onChange={(e) => setNights(Number(e.target.value))} />
        </label>
      </fieldset>
    </div>
  )
}
