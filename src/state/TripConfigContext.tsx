import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { TripConfig } from '../../engine/trip'
import { defaultTripConfig } from './defaultTripConfig'
import { tripConfigFromUrl, urlWithTripConfig } from './urlState'

interface TripConfigContextValue {
  config: TripConfig
  setConfig: (config: TripConfig) => void
  updateConfig: (updater: (config: TripConfig) => TripConfig) => void
  shareUrl: string
}

const TripConfigContext = createContext<TripConfigContextValue | null>(null)

function readInitialConfig(): TripConfig {
  if (typeof window === 'undefined') return defaultTripConfig()
  return tripConfigFromUrl(window.location.href) ?? defaultTripConfig()
}

export function TripConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<TripConfig>(readInitialConfig)

  // The URL is the persistence mechanism (§1) — every config change is
  // written back with replaceState so the address bar always reflects the
  // current trip and a copy-pasted link reproduces it exactly, without
  // spamming browser history on every keystroke.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const nextUrl = urlWithTripConfig(window.location.href, config)
    window.history.replaceState(null, '', nextUrl.toString())
  }, [config])

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return urlWithTripConfig(window.location.href, config).toString()
  }, [config])

  const updateConfig = (updater: (config: TripConfig) => TripConfig) => {
    setConfig((current) => updater(current))
  }

  return <TripConfigContext.Provider value={{ config, setConfig, updateConfig, shareUrl }}>{children}</TripConfigContext.Provider>
}

export function useTripConfig(): TripConfigContextValue {
  const ctx = useContext(TripConfigContext)
  if (!ctx) throw new Error('useTripConfig must be used within a TripConfigProvider')
  return ctx
}
