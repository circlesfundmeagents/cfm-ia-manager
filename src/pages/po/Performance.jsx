import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import StatCard from '../../components/StatCard'

export default function Performance() {
  const { officer } = useAuth()
  const [snapshots, setSnapshots] = useState(null)

  useEffect(() => {
    supabase.from('kpi_snapshots').select('*')
      .eq('officer_id', officer.id)
      .order('period', { ascending: false })
      .then(({ data }) => setSnapshots(data ?? []))
  }, [officer.id])

  if (!snapshots) return <p>Loading…</p>
  const latest = snapshots[0]

  return (
    <>
      <div className="page-header">
        <div>
          <h1>My Performance</h1>
          <p>Rank: {officer.rank?.replace('_', ' ')}</p>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard label="Acquisition score" value={latest?.acquisition_score ?? '—'} tone="gold" />
        <StatCard label="Portfolio quality" value={latest ? `${latest.portfolio_quality_score}/100` : '—'} tone="green" />
        <StatCard label="Overall performance" value={latest?.overall_performance_score ?? '—'} />
        <StatCard label="Compliance points" value={officer.compliance_points} />
      </div>

      <div className="card">
        <h3>Monthly history</h3>
        {snapshots.length === 0 ? (
          <div className="empty-state"><h3>No history yet</h3><p>Your first snapshot lands after month end.</p></div>
        ) : (
          <table>
            <thead><tr><th>Month</th><th>Acquisition</th><th>Portfolio quality</th><th>Overall</th><th>At-risk rate</th><th>Default rate</th></tr></thead>
            <tbody>
              {snapshots.map((s) => (
                <tr key={s.id}>
                  <td>{new Date(s.period).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</td>
                  <td>{s.acquisition_score}</td>
                  <td>{s.portfolio_quality_score}</td>
                  <td>{s.overall_performance_score}</td>
                  <td>{Number(s.at_risk_rate).toFixed(1)}%</td>
                  <td>{Number(s.default_rate).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
