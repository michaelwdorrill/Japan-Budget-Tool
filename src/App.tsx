import { TripConfigProvider } from './state/TripConfigContext'
import { Wizard } from './wizard/Wizard'
import { ScenarioComparison } from './components/ScenarioComparison'

function App() {
  return (
    <TripConfigProvider>
      <main>
        <h1>Japan Trip Budget Estimator</h1>
        <Wizard />
        <ScenarioComparison />
      </main>
    </TripConfigProvider>
  )
}

export default App
