import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import StatCard from '../../components/StatCard'
import StatusBadge from '../../components/StatusBadge'

const ATTENTION_STATUSES = [
  'due_soon', 'needs_follow_up', 'at_risk', 'minor_recovery_request',
  'defaulted', 'major_recovery_request', 'recovery_pending_review',
]

export default function Dashboard() {
  const [members, setMembers] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('members')
      .select('id, full_name, phone, status, savings_frequency, last_contribution_date')
      .eq('is_archived', false)
      .order('status_changed_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setError(error.message)
        else setMembers(data)
      })
    return () => { cancelled = true }
  }, [])

  if (error) return <p className="error-text">{error}</p>
  if (!members) return <p>Loading your portfolio…</p>

  const active = members.filter((m) => m.status === 'active').length
  const atRisk = members.filter((m) => ['at_risk', 'minor_recovery_request'].includes(m.status)).length
  const needsAttention = members.filter((m) => ATTENTION_STATUSES.includes(m.status))
  const newLeads = members.filter((m) => m.status === 'registration_pending').length

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Today's Portfolio</h1>
          <p>What needs your attention right now.</p>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard label="Total portfolio" value={members.length} />
        <StatCard label="Active" value={active} tone="green" />
        <StatCard label="At risk" value={atRisk} />
        <StatCard label="New leads" value={newLeads} tone="gold" />
      </div>

      <div className="card">
        <h3>Needs attention ({needsAttention.length})</h3>
        {needsAttention.length === 0 ? (
          <div className="empty-state">
            <h3>Nothing needs attention today</h3>
            <p>All caught up — check back after your next round of visits.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>Member</th><th>Phone</th><th>Frequency</th><th>Last contribution</th><th>Status</th></tr>
            </thead>
            <tbody>
              {needsAttention.map((m) => (
                <tr key={m.id}>
                  <td>{m.full_name}</td>
                  <td>{m.phone}</td>
                  <td>{m.savings_frequency}</td>
                  <td>{m.last_contribution_date ?? '—'}</td>
                  <td><StatusBadge status={m.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
