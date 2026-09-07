import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import StatCard from '../../components/StatCard'
import StatusBadge from '../../components/StatusBadge'

export default function Earnings() {
  const [commissions, setCommissions] = useState(null)

  useEffect(() => {
    supabase.from('commissions')
      .select('id, type, amount, status, created_at, members(full_name)')
      .order('created_at', { ascending: false })
      .then(({ data }) => setCommissions(data ?? []))
  }, [])

  if (!commissions) return <p>Loading…</p>

  const sum = (status) => commissions.filter((c) => c.status === status).reduce((a, c) => a + Number(c.amount), 0)

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Earnings</h1>
          <p>Commission credit lags KPI credit by design — a Qualified Member counts toward your score immediately, but the ₦2,000 stays "pending" until Head Office verifies it.</p>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard label="Pending" value={`₦${sum('pending').toLocaleString()}`} tone="gold" />
        <StatCard label="Approved" value={`₦${sum('approved').toLocaleString()}`} />
        <StatCard label="Paid" value={`₦${sum('paid').toLocaleString()}`} tone="green" />
      </div>

      <div className="card">
        <h3>History</h3>
        {commissions.length === 0 ? (
          <div className="empty-state"><h3>No commissions yet</h3><p>They'll appear here once a member reaches Qualified Member.</p></div>
        ) : (
          <table>
            <thead><tr><th>Member</th><th>Type</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {commissions.map((c) => (
                <tr key={c.id}>
                  <td>{c.members?.full_name}</td>
                  <td>{c.type}</td>
                  <td>₦{Number(c.amount).toLocaleString()}</td>
                  <td><StatusBadge status={c.status} /></td>
                  <td>{new Date(c.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
