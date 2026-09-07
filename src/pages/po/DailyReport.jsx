import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'

const FOLLOW_UP_OUTCOMES = ['interested', 'registered', 'callback_requested', 'declined']
const AT_RISK_REASONS = ['slow_business', 'family_emergency', 'forgot', 'atm_issue', 'payment_failed', 'other']

const emptyNewMember = { name: '', phone: '', location: '', plan: 'daily', financial_product_id: '', registration_date: today() }
const emptyFollowUp = { member_id: '', outcome: FOLLOW_UP_OUTCOMES[0] }
const emptyAtRisk = { member_id: '', reason: AT_RISK_REASONS[0] }
const emptyRecovery = { member_id: '', reason: '', action_taken: '', expected_next_contribution_date: '' }

function today() { return new Date().toISOString().slice(0, 10) }

export default function DailyReport() {
  const { officer } = useAuth()
  const [members, setMembers] = useState([])
  const [financialProducts, setFinancialProducts] = useState([])
  const [newMembers, setNewMembers] = useState([])
  const [followUps, setFollowUps] = useState([])
  const [atRiskVisits, setAtRiskVisits] = useState([])
  const [recoveryReports, setRecoveryReports] = useState([])
  const [generalFeedback, setGeneralFeedback] = useState('')
  const [suggestions, setSuggestions] = useState('')
  const [status, setStatus] = useState(null) // 'saving' | 'saved' | error string

  useEffect(() => {
    supabase.from('members').select('id, full_name').eq('is_archived', false)
      .then(({ data }) => setMembers(data ?? []))
    supabase.from('financial_products').select('id, name').eq('active', true).order('name')
      .then(({ data }) => setFinancialProducts(data ?? []))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus('saving')
    const { error } = await supabase.from('daily_reports').upsert({
      officer_id: officer.id,
      report_date: today(),
      new_members: newMembers,
      follow_ups: followUps,
      at_risk_visits: atRiskVisits,
      recovery_reports: recoveryReports,
      general_feedback: generalFeedback || null,
      suggestions: suggestions || null,
    }, { onConflict: 'officer_id,report_date' })
    setStatus(error ? error.message : 'saved')
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>End-of-Day Report</h1>
          <p>{today()}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <Section title="New members" onAdd={() => setNewMembers([...newMembers, { ...emptyNewMember }])}>
          {newMembers.map((row, i) => (
            <RowGrid key={i} onRemove={() => setNewMembers(newMembers.filter((_, j) => j !== i))}>
              <input placeholder="Name" value={row.name}
                onChange={(e) => updateAt(newMembers, setNewMembers, i, { name: e.target.value })} />
              <input placeholder="Phone" value={row.phone}
                onChange={(e) => updateAt(newMembers, setNewMembers, i, { phone: e.target.value })} />
              <input placeholder="Location" value={row.location}
                onChange={(e) => updateAt(newMembers, setNewMembers, i, { location: e.target.value })} />
              <select value={row.plan} onChange={(e) => updateAt(newMembers, setNewMembers, i, { plan: e.target.value })}>
                <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
              </select>
              <select value={row.financial_product_id} onChange={(e) => updateAt(newMembers, setNewMembers, i, { financial_product_id: e.target.value })}>
                <option value="">Contribution scheme…</option>
                {financialProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </RowGrid>
          ))}
        </Section>

        <Section title="Follow-ups" onAdd={() => setFollowUps([...followUps, { ...emptyFollowUp }])}>
          {followUps.map((row, i) => (
            <RowGrid key={i} onRemove={() => setFollowUps(followUps.filter((_, j) => j !== i))}>
              <MemberSelect members={members} value={row.member_id}
                onChange={(v) => updateAt(followUps, setFollowUps, i, { member_id: v })} />
              <select value={row.outcome} onChange={(e) => updateAt(followUps, setFollowUps, i, { outcome: e.target.value })}>
                {FOLLOW_UP_OUTCOMES.map((o) => <option key={o} value={o}>{o.replace('_', ' ')}</option>)}
              </select>
            </RowGrid>
          ))}
        </Section>

        <Section title="At-risk visits" onAdd={() => setAtRiskVisits([...atRiskVisits, { ...emptyAtRisk }])}>
          {atRiskVisits.map((row, i) => (
            <RowGrid key={i} onRemove={() => setAtRiskVisits(atRiskVisits.filter((_, j) => j !== i))}>
              <MemberSelect members={members} value={row.member_id}
                onChange={(v) => updateAt(atRiskVisits, setAtRiskVisits, i, { member_id: v })} />
              <select value={row.reason} onChange={(e) => updateAt(atRiskVisits, setAtRiskVisits, i, { reason: e.target.value })}>
                {AT_RISK_REASONS.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
              </select>
            </RowGrid>
          ))}
        </Section>

        <Section title="Recovery reports" onAdd={() => setRecoveryReports([...recoveryReports, { ...emptyRecovery }])}>
          {recoveryReports.map((row, i) => (
            <div key={i} className="card" style={{ marginBottom: '0.75rem' }}>
              <RowGrid onRemove={() => setRecoveryReports(recoveryReports.filter((_, j) => j !== i))}>
                <MemberSelect members={members} value={row.member_id}
                  onChange={(v) => updateAt(recoveryReports, setRecoveryReports, i, { member_id: v })} />
                <input placeholder="Reason" value={row.reason}
                  onChange={(e) => updateAt(recoveryReports, setRecoveryReports, i, { reason: e.target.value })} />
              </RowGrid>
              <div className="field">
                <input placeholder="Action taken" value={row.action_taken}
                  onChange={(e) => updateAt(recoveryReports, setRecoveryReports, i, { action_taken: e.target.value })} />
              </div>
              <div className="field">
                <label>Expected next contribution date</label>
                <input type="date" value={row.expected_next_contribution_date}
                  onChange={(e) => updateAt(recoveryReports, setRecoveryReports, i, { expected_next_contribution_date: e.target.value })} />
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                Evidence upload comes from your member's file — attach photos there before submitting this report.
              </p>
            </div>
          ))}
        </Section>

        <div className="card">
          <div className="field">
            <label>General feedback</label>
            <textarea rows={3} value={generalFeedback} onChange={(e) => setGeneralFeedback(e.target.value)} />
          </div>
          <div className="field">
            <label>Suggestions</label>
            <textarea rows={2} value={suggestions} onChange={(e) => setSuggestions(e.target.value)} />
          </div>
        </div>

        <div>
          <button type="submit" disabled={status === 'saving'}>
            {status === 'saving' ? 'Submitting…' : 'Submit report'}
          </button>
          {status === 'saved' && <span style={{ marginLeft: '0.8rem', color: 'var(--brand-green-dark)' }}>Saved.</span>}
          {status && status !== 'saving' && status !== 'saved' && <span className="error-text">{status}</span>}
        </div>
      </form>
    </>
  )
}

function Section({ title, onAdd, children }) {
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <button type="button" className="secondary" onClick={onAdd}>+ Add</button>
      </div>
      {children}
    </div>
  )
}

function RowGrid({ children, onRemove }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Array.isArray(children) ? children.length : 1}, 1fr) auto`, gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
      {children}
      <button type="button" className="secondary" onClick={onRemove}>Remove</button>
    </div>
  )
}

function MemberSelect({ members, value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select member…</option>
      {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
    </select>
  )
}

function updateAt(list, setList, index, patch) {
  setList(list.map((row, i) => (i === index ? { ...row, ...patch } : row)))
}
