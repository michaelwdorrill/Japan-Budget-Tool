import { useMemo, useState } from 'react'
import { runMonteCarlo, jpyToUsd } from '../../engine/index'
import type { TripConfig } from '../../engine/trip'
import { priceData } from '../data'
import { useTripConfig } from '../state/TripConfigContext'
import { applyPreset, type Preset } from '../presets'

interface Scenario {
  label: string
  config: TripConfig
}

function formatUsd(amountUsd: number): string {
  return `$${amountUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

const PRESET_LABELS: Record<Preset, string> = { lean: 'Lean', comfortable: 'Comfortable', splurge: 'Splurge' }

function ScenarioSlot({ slot, onSet, onClear }: { slot: Scenario | null; onSet: (s: Scenario) => void; onClear: () => void }) {
  const { config } = useTripConfig()

  const result = useMemo(() => {
    if (!slot) return null
    try {
      const mc = runMonteCarlo(slot.config, priceData, { seed: 1 })
      return { p50: mc.usdPerPerson.p50, p80: mc.usdPerPerson.p80, partyP80Jpy: mc.jpyParty.p80 }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  }, [slot])

  return (
    <div className="scenario-slot">
      {!slot ? (
        <div className="scenario-slot__empty">
          <button type="button" onClick={() => onSet({ label: 'Current trip', config })}>
            Save current trip
          </button>
          {(['lean', 'comfortable', 'splurge'] as Preset[]).map((preset) => (
            <button key={preset} type="button" onClick={() => onSet({ label: PRESET_LABELS[preset], config: applyPreset(config, preset) })}>
              Seed {PRESET_LABELS[preset]}
            </button>
          ))}
        </div>
      ) : (
        <div className="scenario-slot__filled">
          <div className="scenario-slot__label">{slot.label}</div>
          {result && 'error' in result ? (
            <p className="scenario-slot__error">Can't price: {result.error}</p>
          ) : result ? (
            <>
              <div className="scenario-slot__amount">{formatUsd(result.p80)} <span>P80/person</span></div>
              <div className="scenario-slot__secondary">{formatUsd(result.p50)} P50/person</div>
              <div className="scenario-slot__secondary">
                {jpyToUsd(result.partyP80Jpy, config.money.jpyPerUsd, { cardFxFeePct: config.money.cardFxFeePct }).toLocaleString('en-US', {
                  maximumFractionDigits: 0,
                })}{' '}
                USD total for the party (P80)
              </div>
            </>
          ) : null}
          <button type="button" onClick={onClear}>
            Clear
          </button>
        </div>
      )}
    </div>
  )
}

// §6: "Scenario comparison: save and compare up to three configurations
// side by side. Seed with Lean / Comfortable / Splurge presets so the
// first-time user immediately sees the range of the decision space." Slots
// are in-memory only (no accounts, no localStorage per §1/§10) — a
// deliberate snapshot tool for the current session, not a persistence
// mechanism.
export function ScenarioComparison() {
  const [slots, setSlots] = useState<[Scenario | null, Scenario | null, Scenario | null]>([null, null, null])

  const setSlot = (index: 0 | 1 | 2, scenario: Scenario) => {
    setSlots((current) => {
      const next = [...current] as typeof current
      next[index] = scenario
      return next
    })
  }

  const clearSlot = (index: 0 | 1 | 2) => {
    setSlots((current) => {
      const next = [...current] as typeof current
      next[index] = null
      return next
    })
  }

  return (
    <section className="scenario-comparison">
      <h2>Compare scenarios</h2>
      <p className="scenario-comparison__hint">
        Save the trip you're currently configuring, or seed a slot with the Lean/Comfortable/Splurge presets applied to your current
        itinerary, and see the range side by side.
      </p>
      <div className="scenario-comparison__slots">
        {([0, 1, 2] as const).map((index) => (
          <ScenarioSlot key={index} slot={slots[index]} onSet={(s) => setSlot(index, s)} onClear={() => clearSlot(index)} />
        ))}
      </div>
    </section>
  )
}
