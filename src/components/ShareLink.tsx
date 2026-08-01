import { useState } from 'react'
import { useTripConfig } from '../state/TripConfigContext'

// §1: the URL *is* the persistence mechanism — this is how a configured
// trip gets shared or saved.
export function ShareLink() {
  const { shareUrl } = useTripConfig()
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API can be unavailable (permissions, non-HTTPS context);
      // the input below still lets the user select-and-copy manually.
    }
  }

  return (
    <div className="share-link">
      <label htmlFor="share-link-input">Shareable link</label>
      <div className="share-link__row">
        <input id="share-link-input" type="text" readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" onClick={handleCopy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="share-link__hint">This link reproduces your trip exactly — no account needed.</p>
    </div>
  )
}
