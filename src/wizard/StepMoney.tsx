import { useTripConfig } from '../state/TripConfigContext'
import type { TripConfig } from '../../engine/trip'
import { SUPPORTED_CURRENCIES, currencySymbolFor } from '../currency'

type FlightMode = TripConfig['flight']['mode']

export function StepMoney() {
  const { config, updateConfig } = useTripConfig()
  const { flight, money } = config

  const setFlightMode = (mode: FlightMode) => {
    updateConfig((c) => ({ ...c, flight: { ...c.flight, mode } }))
  }

  const setFlightField = <K extends keyof TripConfig['flight']>(key: K, value: TripConfig['flight'][K]) => {
    updateConfig((c) => ({ ...c, flight: { ...c.flight, [key]: value } }))
  }

  const setMoneyField = <K extends keyof TripConfig['money']>(key: K, value: TripConfig['money'][K]) => {
    updateConfig((c) => ({ ...c, money: { ...c.money, [key]: value } }))
  }

  const setPersonalShopping = (value: number) => {
    updateConfig((c) => ({ ...c, shopping: { personalBudgetJpy: Math.max(0, value) } }))
  }

  const currencySymbol = currencySymbolFor(money.currencyCode)

  return (
    <div className="step-form">
      <fieldset>
        <legend>Flight</legend>
        <label>
          <input type="radio" name="flight-mode" checked={flight.mode === 'exclude'} onChange={() => setFlightMode('exclude')} />
          Exclude from budget (e.g. already booked separately)
        </label>
        <label>
          <input type="radio" name="flight-mode" checked={flight.mode === 'cash'} onChange={() => setFlightMode('cash')} />
          Paying cash
        </label>
        <label>
          <input type="radio" name="flight-mode" checked={flight.mode === 'points'} onChange={() => setFlightMode('points')} />
          Using points/miles
        </label>

        {flight.mode === 'cash' && (
          <label>
            Estimated airfare ({currencySymbol}, per person)
            <input
              type="number"
              min={0}
              value={flight.cashEstimateUsd ?? 0}
              onChange={(e) => setFlightField('cashEstimateUsd', Number(e.target.value))}
            />
          </label>
        )}

        {flight.mode === 'points' && (
          <>
            <label>
              Points used (per person)
              <input
                type="number"
                min={0}
                value={flight.pointsUsed ?? 0}
                onChange={(e) => setFlightField('pointsUsed', Number(e.target.value))}
              />
            </label>
            <label>
              Value per point (cents)
              <input
                type="number"
                min={0}
                step={0.1}
                value={flight.centsPerPoint ?? 0}
                onChange={(e) => setFlightField('centsPerPoint', Number(e.target.value))}
              />
            </label>
            <p className="field-note">
              Shown separately as an opportunity-cost figure — it's not money leaving your bank account, so it's never added to the
              budget total (§7).
            </p>
          </>
        )}

        {flight.mode !== 'exclude' && (
          <label>
            Taxes, fees &amp; carrier surcharges ({currencySymbol}, per person)
            <input
              type="number"
              min={0}
              value={flight.taxesAndFeesUsd}
              onChange={(e) => setFlightField('taxesAndFeesUsd', Number(e.target.value))}
            />
          </label>
        )}
      </fieldset>

      <fieldset>
        <legend>Currency</legend>
        <label>
          Home currency
          <select value={money.currencyCode ?? 'USD'} onChange={(e) => setMoneyField('currencyCode', e.target.value)}>
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label} ({c.symbol})
              </option>
            ))}
          </select>
        </label>
        <p className="field-note">
          §7 seam: FX conversion happens the same way regardless of currency — only the display symbol changes. Every USD-labeled
          amount above is really "your home currency."
        </p>
        <label>
          JPY per {currencySymbol}
          <input type="number" min={1} value={money.jpyPerUsd} onChange={(e) => setMoneyField('jpyPerUsd', Number(e.target.value))} />
        </label>
        <label>
          FX stress band (±%)
          <input type="number" min={0} value={money.fxStressPct} onChange={(e) => setMoneyField('fxStressPct', Number(e.target.value))} />
        </label>
        <label>
          Card FX fee (%)
          <input type="number" min={0} step={0.1} value={money.cardFxFeePct} onChange={(e) => setMoneyField('cardFxFeePct', Number(e.target.value))} />
        </label>
        <label>
          Cash withdrawn (JPY/person/day) — planning aid, not added to the total
          <input
            type="number"
            min={0}
            value={money.cashJpyPerPersonPerDay}
            onChange={(e) => setMoneyField('cashJpyPerPersonPerDay', Number(e.target.value))}
          />
        </label>
        <p className="field-note">
          How much of your budget you expect to carry as cash rather than put on a card. It splits the same spend between payment
          methods, so it deliberately does not change the total — the label used to imply otherwise.
        </p>
      </fieldset>

      <fieldset>
        <legend>Reserves</legend>
        <label>
          Contingency (% of variable costs)
          <input
            type="number"
            min={0}
            value={money.contingencyPct}
            onChange={(e) => setMoneyField('contingencyPct', Number(e.target.value))}
          />
        </label>
        <label>
          Personal shopping budget (JPY, per person)
          <input
            type="number"
            min={0}
            value={config.shopping?.personalBudgetJpy ?? 0}
            onChange={(e) => setPersonalShopping(Number(e.target.value))}
          />
        </label>
        <p className="field-note">Defaults to ¥0 — souvenirs are already covered separately by the omiyage budget.</p>
      </fieldset>
    </div>
  )
}
