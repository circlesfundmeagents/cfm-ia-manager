import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function Leaderboard() {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    // No manual scoping needed here — RLS policies on kpi_snapshots already
    // restrict which rows come back based on the caller's role/team/branch.
    supabase.from('kpi_snapshots')
      .select('officer_id, period, acquisition_score, portfolio_quality_score, overall_performance_score, officers(full_name)')
      .order('period', { ascending: false })
      .order('overall_performance_score', { ascending: false })
      .then(({ data }) => setRows(data ?? []))
  }, [])

  if (!rows) return <p>Loading…</p>

  const latestPeriod = rows[0]?.period
  const current = rows.filter((r) => r.period === latestPeriod)

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Leaderboard</h1>
          <p>{latestPeriod ? new Date(latestPeriod).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : ''}</p>
        </div>
      </div>
      <div className="card">
        {current.length === 0 ? (
          <div className="empty-state"><h3>No KPI snapshot yet</h3><p>Snapshots are generated on the 1st of each month.</p></div>
        ) : (
          <table>
            <thead><tr><th>#</th><th>Officer</th><th>Acquisition</th><th>Portfolio quality</th><th>Overall</th></tr></thead>
            <tbody>
              {current.map((r, i) => (
                <tr key={r.officer_id}>
                  <td>{i + 1}</td>
                  <td>{r.officers?.full_name}</td>
                  <td>{r.acquisition_score}</td>
                  <td>{r.portfolio_quality_score}</td>
                  <td><strong>{r.overall_performance_score}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
