import { useEffect, useRef, useState } from 'react'
import { runMonteCarlo, type MonteCarloResult, type PriceData, type TripConfig } from '../../engine/index'

const DEBOUNCE_MS = 300
const SEED = 1 // fixed seed: a given trip config always reproduces the same distribution

// 10,000 trials takes ~100-150ms — fast enough to not block typing, but
// slow enough to feel janky on every keystroke. Debounce so it only runs
// once input settles, rather than trading away the full trial count (§3.3
// specifies 10,000 trials; this keeps that intact instead of shrinking it
// for snappiness).
export function useDebouncedMonteCarlo(config: TripConfig, priceData: PriceData, enabled: boolean): MonteCarloResult | null {
  const [result, setResult] = useState<MonteCarloResult | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (!enabled) return
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      try {
        setResult(runMonteCarlo(config, priceData, { seed: SEED }))
      } catch {
        // Leave the previous result in place; the deterministic pass upstream
        // already surfaces the error message.
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(timeoutRef.current)
  }, [config, priceData, enabled])

  return result
}
