import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

const ROLES = ['portfolio_officer', 'team_leader', 'branch_manager', 'general_agent_manager', 'head_office_admin']
const RANKS = ['applicant', 'training', 'temporary_po', 'junior_po', 'senior_po', 'team_leader', 'branch_manager', 'area_manager']

export default function ManageOfficers() {
  const [officers, setOfficers] = useState(null)
  const [error, setError] = useState(null)

  async function loadOfficers() {
    const { data, error } = await supabase.from('officers').select('*').order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setOfficers(data)
  }

  useEffect(() => { loadOfficers() }, [])

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Manage Officers</h1>
          <p>Create logins for your field team and adjust their role or rank.</p>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <CreateOfficerForm onCreated={loadOfficers} />

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3>All officers</h3>
        {!officers ? <p>Loading…</p> : officers.length === 0 ? (
          <div className="empty-state"><h3>No officers yet</h3></div>
        ) : (
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Rank</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {officers.map((o) => <OfficerRow key={o.id} officer={o} onSaved={loadOfficers} />)}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

function CreateOfficerForm({ onCreated }) {
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'portfolio_officer', rank: 'applicant' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  function set(patch) { setForm({ ...form, ...patch }) }

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setSuccess(null)
    const { data, error } = await supabase.functions.invoke('create-officer', { body: form })
    setBusy(false)
    if (error) {
      // Supabase wraps the function's own error message here
      setError(error.context?.error || error.message)
      return
    }
    if (data?.error) {
      setError(data.error)
      return
    }
    setSuccess(`Account created for ${form.email}. Give them their email and password to log in.`)
    setForm({ full_name: '', email: '', password: '', role: 'portfolio_officer', rank: 'applicant' })
    onCreated()
  }

  return (
    <div className="card">
      <h3>Create a new officer</h3>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="field">
            <label>Full name</label>
            <input required value={form.full_name} onChange={(e) => set({ full_name: e.target.value })} />
          </div>
          <div className="field">
            <label>Email</label>
            <input required type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
          </div>
          <div className="field">
            <label>Temporary password</label>
            <input required minLength={8} value={form.password} onChange={(e) => set({ password: e.target.value })} placeholder="At least 8 characters" />
          </div>
          <div className="field">
            <label>Role</label>
            <select value={form.role} onChange={(e) => set({ role: e.target.value })}>
              {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Rank</label>
            <select value={form.rank} onChange={(e) => set({ rank: e.target.value })}>
              {RANKS.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
        </div>
        {error && <p className="error-text">{error}</p>}
        {success && <p style={{ color: 'var(--brand-green-dark)', fontSize: '0.9rem' }}>{success}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create officer'}</button>
      </form>
    </div>
  )
}

function OfficerRow({ officer, onSaved }) {
  const [role, setRole] = useState(officer.role)
  const [rank, setRank] = useState(officer.rank)
  const [busy, setBusy] = useState(false)

  const changed = role !== officer.role || rank !== officer.rank

  async function save() {
    setBusy(true)
    await supabase.from('officers').update({ role, rank }).eq('id', officer.id)
    setBusy(false)
    onSaved()
  }

  return (
    <tr>
      <td>{officer.full_name}</td>
      <td>{officer.email}</td>
      <td>
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
        </select>
      </td>
      <td>
        <select value={rank} onChange={(e) => setRank(e.target.value)}>
          {RANKS.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
        </select>
      </td>
      <td>{officer.status}</td>
      <td>{changed && <button disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>}</td>
    </tr>
  )
}
