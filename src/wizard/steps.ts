import type { ComponentType } from 'react'
import { StepWhoAndWhen } from './StepWhoAndWhen'
import { StepWhere } from './StepWhere'
import { StepSleep } from './StepSleep'
import { StepEat } from './StepEat'
import { StepDo } from './StepDo'
import { StepGettingAround } from './StepGettingAround'
import { StepMoney } from './StepMoney'

export interface WizardStep {
  id: string
  title: string
  description: string
  Component: ComponentType
}

// §5.3: seven steps, every one skippable with a sensible default.
export const WIZARD_STEPS: WizardStep[] = [
  { id: 'who-when', title: '1. Who and when', description: 'Party size, dates or season, trip length.', Component: StepWhoAndWhen },
  { id: 'where', title: '2. Where', description: 'Pick cities and how many nights in each.', Component: StepWhere },
  { id: 'sleep', title: '3. Where you’ll sleep', description: 'Lodging tier per city.', Component: StepSleep },
  { id: 'eat', title: '4. What you’ll eat', description: 'Breakfast, lunch, dinner tiers, plus splurge meals.', Component: StepEat },
  { id: 'do', title: '5. What you’ll do', description: 'Named activities and a fallback tier for unplanned days.', Component: StepDo },
  { id: 'getting-around', title: '6. Getting around', description: 'Intercity transport strategy and the optimizer’s recommendation.', Component: StepGettingAround },
  { id: 'money', title: '7. Money', description: 'Flights, FX, contingency, card fees.', Component: StepMoney },
]
