import { TripConfigProvider } from './state/TripConfigContext'
import { Wizard } from './wizard/Wizard'

function App() {
  return (
    <TripConfigProvider>
      <main>
        <h1>Japan Trip Budget Estimator</h1>
        <Wizard />
      </main>
    </TripConfigProvider>
  )
}

export default App
