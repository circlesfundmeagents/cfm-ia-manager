import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function FinancialProducts() {
  const [products, setProducts] = useState(null)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data, error } = await supabase.from('financial_products').select('*').order('created_at')
    if (error) setError(error.message)
    else setProducts(data)
  }

  useEffect(() => { load() }, [])

  async function addProduct(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('financial_products').insert({ name: newName.trim() })
    setBusy(false)
    if (error) setError(error.message)
    else { setNewName(''); load() }
  }

  async function toggleActive(product) {
    await supabase.from('financial_products').update({ active: !product.active }).eq('id', product.id)
    load()
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Financial Products</h1>
          <p>The contribution schemes officers can pick when registering a new member.</p>
        </div>
      </div>

      <div className="card">
        <h3>Add a product</h3>
        <form onSubmit={addProduct} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label>Product name</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Salary Advance" />
          </div>
          <button type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add'}</button>
        </form>
        {error && <p className="error-text">{error}</p>}
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3>All products</h3>
        {!products ? <p>Loading…</p> : (
          <table>
            <thead><tr><th>Name</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.active ? <span className="badge status-active">active</span> : <span className="badge status-on_hold">retired</span>}</td>
                  <td>
                    <button className="secondary" onClick={() => toggleActive(p)}>
                      {p.active ? 'Retire' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', marginTop: '0.75rem' }}>
        Retiring a product removes it from the dropdown for new reports, but keeps it visible on past reports that already used it.
      </p>
    </>
  )
}
