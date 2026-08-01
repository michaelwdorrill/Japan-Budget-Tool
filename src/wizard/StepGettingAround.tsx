import { useMemo } from 'react'
import { useTripConfig } from '../state/TripConfigContext'
import { priceData } from '../data'
import { optimizeTransport } from '../../engine/index'

function formatJpy(amountJpy: number): string {
  return `¥${amountJpy.toLocaleString('en-US')}`
}

export function StepGettingAround() {
  const { config, updateConfig } = useTripConfig()
  const { transport } = config

  const optimizerResult = useMemo(() => {
    try {
      return optimizeTransport(config, priceData)
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  }, [config])

  const setRailClass = (railClass: 'ordinary' | 'green') => {
    updateConfig((c) => ({ ...c, transport: { ...c.transport, railClass } }))
  }

  const setLuggageForwarding = (luggageForwarding: boolean) => {
    updateConfig((c) => ({ ...c, transport: { ...c.transport, luggageForwarding } }))
  }

  const setStrategy = (strategy: string) => {
    updateConfig((c) => ({ ...c, transport: { ...c.transport, strategy: strategy as typeof c.transport.strategy } }))
  }

  return (
    <div className="step-form">
      <fieldset>
        <legend>Preferences</legend>
        <label>
          Rail class
          <select value={transport.railClass} onChange={(e) => setRailClass(e.target.value as 'ordinary' | 'green')}>
            <option value="ordinary">Ordinary</option>
            <option value="green">Green Car</option>
          </select>
        </label>
        <label>
          <input type="checkbox" checked={transport.luggageForwarding} onChange={(e) => setLuggageForwarding(e.target.checked)} />
          Use luggage forwarding (takkyubin) between cities
        </label>
        {config.itinerary.legs.length >= 4 && (
          <p className="field-note">3+ city changes — luggage forwarding is usually worth it here.</p>
        )}
      </fieldset>

      <fieldset>
        <legend>Strategy</legend>
        <label>
          <input type="radio" name="strategy" checked={transport.strategy === 'auto'} onChange={() => setStrategy('auto')} />
          Auto (recommended) — picks the cheapest option below
        </label>
        <label>
          <input
            type="radio"
            name="strategy"
            checked={transport.strategy === 'point_to_point'}
            onChange={() => setStrategy('point_to_point')}
          />
          Always pay point-to-point
        </label>
      </fieldset>

      {'error' in optimizerResult ? (
        <p className="field-note field-note--warning">Can't compute transport options yet: {optimizerResult.error}</p>
      ) : (
        <div className="transport-options">
          <h3>Top options</h3>
          {optimizerResult.options.slice(0, 3).map((option) => (
            <div key={option.id} className="transport-options__row">
              <label>
                <input type="radio" name="strategy" checked={transport.strategy === option.id} onChange={() => setStrategy(option.id)} />
                <strong>{option.label}</strong> — {formatJpy(option.totalJpy)}
                {option.savingsVsPointToPointJpy > 0 && ` (saves ${formatJpy(option.savingsVsPointToPointJpy)})`}
                {option.addedTravelTimeMinutes > 0 && ` · +${option.addedTravelTimeMinutes}min`}
              </label>
              <p className="field-note">{option.why}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
