import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import StatusBadge from '../../components/StatusBadge'

const NEXT_STATUS = {
  registration_pending: 'registered',
  registered: 'pending_approval',
  pending_approval: 'approved_acquisition',
  approved_acquisition: 'qualified_member',
}

const TABS = ['Acquisitions', 'Recovery requests', 'Commissions']

export default function Approvals() {
  const [tab, setTab] = useState('Acquisitions')
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Approvals</h1>
          <p>Every action here runs through a server-side function — nothing here trusts the browser.</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        {TABS.map((t) => (
          <button key={t} className={t === tab ? '' : 'secondary'} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      {tab === 'Acquisitions' && <AcquisitionsPanel />}
      {tab === 'Recovery requests' && <RecoveryPanel />}
      {tab === 'Commissions' && <CommissionsPanel />}
    </>
  )
}

function AcquisitionsPanel() {
  const [members, setMembers] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)

  async function load() {
    const { data } = await supabase.from('members')
      .select('id, full_name, phone, status, officers(full_name)')
      .in('status', Object.keys(NEXT_STATUS))
      .order('status_changed_at', { ascending: true })
    setMembers(data ?? [])
  }

  useEffect(() => { load() }, [])

  async function advance(member) {
    setBusyId(member.id)
    setError(null)
    const { error } = await supabase.rpc('fn_change_member_status', {
      p_member_id: member.id,
      p_new_status: NEXT_STATUS[member.status],
    })
    setBusyId(null)
    if (error) setError(error.message)
    else load()
  }

  if (!members) return <p>Loading…</p>

  return (
    <div className="card">
      {error && <p className="error-text">{error}</p>}
      {members.length === 0 ? (
        <div className="empty-state"><h3>Nothing waiting</h3><p>All acquisitions are up to date.</p></div>
      ) : (
        <table>
          <thead><tr><th>Member</th><th>Officer</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>{m.full_name}</td>
                <td>{m.officers?.full_name}</td>
                <td><StatusBadge status={m.status} /></td>
                <td>
                  <button disabled={busyId === m.id} onClick={() => advance(m)}>
                    Advance to {NEXT_STATUS[m.status].replace('_', ' ')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function RecoveryPanel() {
  const [requests, setRequests] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)

  async function load() {
    const { data } = await supabase.from('recovery_requests')
      .select('id, type, status, cycles_completed, requested_at, members(full_name), officers(full_name)')
      .eq('status', 'pending_review')
      .order('requested_at', { ascending: true })
    setRequests(data ?? [])
  }

  useEffect(() => { load() }, [])

  async function review(req, decision) {
    setBusyId(req.id)
    setError(null)
    const { error } = await supabase.rpc('fn_review_recovery_request', {
      p_request_id: req.id, p_decision: decision,
    })
    setBusyId(null)
    if (error) setError(error.message)
    else load()
  }

  if (!requests) return <p>Loading…</p>

  return (
    <div className="card">
      {error && <p className="error-text">{error}</p>}
      {requests.length === 0 ? (
        <div className="empty-state"><h3>No pending recovery requests</h3></div>
      ) : (
        <table>
          <thead><tr><th>Member</th><th>Officer</th><th>Type</th><th>Cycles</th><th></th></tr></thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td>{r.members?.full_name}</td>
                <td>{r.officers?.full_name}</td>
                <td>{r.type}</td>
                <td>{r.type === 'major' ? `${r.cycles_completed}/2` : '—'}</td>
                <td style={{ display: 'flex', gap: '0.4rem' }}>
                  <button disabled={busyId === r.id} onClick={() => review(r, 'approved')}>Approve</button>
                  <button disabled={busyId === r.id} className="danger" onClick={() => review(r, 'rejected')}>Reject</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function CommissionsPanel() {
  const [commissions, setCommissions] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)

  async function load() {
    const { data } = await supabase.from('commissions')
      .select('id, type, amount, status, hold_reason, officers(full_name), members(full_name)')
      .in('status', ['pending', 'approved'])
      .order('created_at', { ascending: true })
    setCommissions(data ?? [])
  }

  useEffect(() => { load() }, [])

  async function act(c) {
    setBusyId(c.id)
    setError(null)
    const fn = c.status === 'pending' ? 'fn_approve_commission' : 'fn_mark_commission_paid'
    const { error } = await supabase.rpc(fn, { p_commission_id: c.id })
    setBusyId(null)
    if (error) setError(error.message)
    else load()
  }

  if (!commissions) return <p>Loading…</p>

  return (
    <div className="card">
      {error && <p className="error-text">{error}</p>}
      {commissions.length === 0 ? (
        <div className="empty-state"><h3>No commissions waiting</h3></div>
      ) : (
        <table>
          <thead><tr><th>Officer</th><th>Member</th><th>Type</th><th>Amount</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {commissions.map((c) => (
              <tr key={c.id}>
                <td>{c.officers?.full_name}</td>
                <td>{c.members?.full_name}</td>
                <td>{c.type}</td>
                <td>₦{Number(c.amount).toLocaleString()}</td>
                <td><StatusBadge status={c.status} />{c.hold_reason && <div style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>{c.hold_reason}</div>}</td>
                <td>
                  <button disabled={busyId === c.id} onClick={() => act(c)}>
                    {c.status === 'pending' ? 'Approve' : 'Mark paid'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
