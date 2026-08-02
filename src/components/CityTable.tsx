import type { CityBreakdownRow } from '../charts'

function formatJpy(amountJpy: number): string {
  return `¥${Math.round(amountJpy).toLocaleString('en-US')}`
}

// §6: "Table by city — cost per night in each city makes the Kyoto-vs-
// Osaka and Tokyo-vs-elsewhere tradeoffs legible." Plain table, no color
// needed — the numbers are the point.
export function CityTable({ rows, cityNames }: { rows: CityBreakdownRow[]; cityNames: Record<string, string> }) {
  if (rows.length === 0) return null

  return (
    <table className="city-table">
      <thead>
        <tr>
          <th>City</th>
          <th>Nights</th>
          <th>Total cost</th>
          <th>Cost / night</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.cityId}>
            <td>{cityNames[row.cityId] ?? row.cityId}</td>
            <td>{row.nights}</td>
            <td>{formatJpy(row.totalJpy)}</td>
            <td>{formatJpy(row.jpyPerNight)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
