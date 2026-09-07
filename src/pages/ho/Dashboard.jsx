import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import StatCard from '../../components/StatCard'

export default function Dashboard() {
  const [counts, setCounts] = useState(null)

  useEffect(() => {
    async function load() {
      const [members, recovery, commissions, reports] = await Promise.all([
        supabase.from('members').select('status', { count: 'exact', head: false }),
        supabase.from('recovery_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending_review'),
        supabase.from('commissions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('daily_reports').select('id', { count: 'exact', head: true }).is('reviewed_at', null),
      ])
      const byStatus = {}
      for (const m of members.data ?? []) byStatus[m.status] = (byStatus[m.status] ?? 0) + 1
      setCounts({
        atRisk: (byStatus.at_risk ?? 0) + (byStatus.minor_recovery_request ?? 0),
        defaulted: (byStatus.defaulted ?? 0) + (byStatus.major_recovery_request ?? 0) + (byStatus.recovery_pending_review ?? 0),
        pendingAcquisitions: (byStatus.registered ?? 0) + (byStatus.pending_approval ?? 0),
        pendingRecovery: recovery.count ?? 0,
        pendingCommissions: commissions.count ?? 0,
        unreviewedReports: reports.count ?? 0,
      })
    }
    load()
  }, [])

  if (!counts) return <p>Loading…</p>

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Head Office Dashboard</h1>
          <p>National overview and today's queues.</p>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard label="Pending acquisitions" value={counts.pendingAcquisitions} tone="gold" />
        <StatCard label="Pending recovery requests" value={counts.pendingRecovery} />
        <StatCard label="Pending commissions" value={counts.pendingCommissions} tone="gold" />
        <StatCard label="At risk" value={counts.atRisk} />
        <StatCard label="Defaulted / in recovery" value={counts.defaulted} />
        <StatCard label="Unreviewed daily reports" value={counts.unreviewedReports} />
      </div>

      <div className="card">
        <p>Head to <strong>Approvals</strong> to work through acquisitions, recovery requests, and commission runs.</p>
      </div>
    </>
  )
}
