import { useMemo, useRef, useState } from 'react'
import { computeBudget } from '../../engine/index'
import { priceData } from '../data'
import { useTripConfig } from '../state/TripConfigContext'
import { isPlausibleTripConfig } from '../state/urlState'
import { downloadTextFile, lineItemsToCsv, tripConfigToJson } from '../export'

// §6 Export: JSON (round-trips back into the app), CSV of line items, and
// a print stylesheet (the print CSS lives in index.css; the button here
// just triggers window.print()).
export function ExportPanel() {
  const { config, setConfig } = useTripConfig()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const budget = useMemo(() => {
    try {
      return computeBudget(config, priceData)
    } catch {
      return null
    }
  }, [config])

  const handleDownloadJson = () => {
    downloadTextFile('japan-trip-budget.json', tripConfigToJson(config), 'application/json')
  }

  const handleDownloadCsv = () => {
    if (!budget) return
    downloadTextFile('japan-trip-budget-line-items.csv', lineItemsToCsv(budget.lineItems), 'text/csv')
  }

  const handleImportClick = () => fileInputRef.current?.click()

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImportError(null)
    try {
      const parsed = JSON.parse(await file.text())
      if (!isPlausibleTripConfig(parsed)) {
        setImportError('That file doesn’t look like a trip budget export.')
        return
      }
      setConfig(parsed)
    } catch {
      setImportError('Could not read that file as JSON.')
    }
  }

  return (
    <div className="export-panel">
      <h3 className="export-panel__title">Export</h3>
      <div className="export-panel__buttons">
        <button type="button" onClick={handleDownloadJson}>
          Download JSON
        </button>
        <button type="button" onClick={handleImportClick}>
          Import JSON
        </button>
        <button type="button" onClick={handleDownloadCsv} disabled={!budget}>
          Download CSV
        </button>
        <button type="button" onClick={() => window.print()}>
          Print summary
        </button>
      </div>
      <input ref={fileInputRef} type="file" accept="application/json" onChange={handleFileChosen} hidden />
      {importError && <p className="export-panel__error">{importError}</p>}
    </div>
  )
}
