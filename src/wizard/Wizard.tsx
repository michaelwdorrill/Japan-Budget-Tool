import { useState } from 'react'
import { WIZARD_STEPS } from './steps'
import { RunningTotal } from '../components/RunningTotal'
import { ShareLink } from '../components/ShareLink'
import { GuidancePanel } from '../components/GuidancePanel'

export function Wizard() {
  const [stepIndex, setStepIndex] = useState(0)
  const step = WIZARD_STEPS[stepIndex]
  const StepComponent = step.Component

  return (
    <div className="wizard">
      <aside className="wizard__sidebar">
        <RunningTotal />
        <ShareLink />
        <GuidancePanel />
      </aside>

      <div className="wizard__main">
        <nav className="wizard__steps" aria-label="Wizard steps">
          {WIZARD_STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`wizard__step-tab${i === stepIndex ? ' wizard__step-tab--active' : ''}`}
              onClick={() => setStepIndex(i)}
            >
              {i + 1}
            </button>
          ))}
        </nav>

        <section className="wizard__step" aria-labelledby="wizard-step-title">
          <h2 id="wizard-step-title">{step.title}</h2>
          <p className="wizard__step-description">{step.description}</p>
          <StepComponent />
        </section>

        <div className="wizard__nav-buttons">
          <button type="button" disabled={stepIndex === 0} onClick={() => setStepIndex((i) => Math.max(0, i - 1))}>
            Back
          </button>
          <span className="wizard__progress">
            Step {stepIndex + 1} of {WIZARD_STEPS.length}
          </span>
          <button
            type="button"
            disabled={stepIndex === WIZARD_STEPS.length - 1}
            onClick={() => setStepIndex((i) => Math.min(WIZARD_STEPS.length - 1, i + 1))}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
