import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = still loading
  const [officer, setOfficer] = useState(null)
  const [loadingOfficer, setLoadingOfficer] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadOfficer() {
      if (!session?.user) {
        setOfficer(null)
        return
      }
      setLoadingOfficer(true)
      const { data, error } = await supabase
        .from('officers')
        .select('*')
        .eq('id', session.user.id)
        .single()
      if (!cancelled) {
        if (error) console.error('Failed to load officer profile:', error.message)
        setOfficer(data ?? null)
        setLoadingOfficer(false)
      }
    }
    loadOfficer()
    return () => { cancelled = true }
  }, [session])

  const value = {
    session,
    officer,
    loading: session === undefined || loadingOfficer,
    signOut: () => supabase.auth.signOut(),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
