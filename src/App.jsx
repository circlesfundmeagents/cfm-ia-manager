import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'

import POPortfolio from './pages/po/Dashboard'
import DailyReport from './pages/po/DailyReport'
import Earnings from './pages/po/Earnings'
import Leaderboard from './pages/po/Leaderboard'
import Performance from './pages/po/Performance'
import HODashboard from './pages/ho/Dashboard'
import HOApprovals from './pages/ho/Approvals'
import ManageOfficers from './pages/ho/ManageOfficers'
import FinancialProducts from './pages/ho/FinancialProducts'

export default function App() {
  const { session, officer, loading } = useAuth()

  if (loading) return <CenteredNote text="Loading…" />
  if (!session) return <Login />
  if (!officer) return <CenteredNote text="Setting up your account…" />

  const isHO = officer.role === 'head_office_admin'

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={isHO ? <HODashboard /> : <POPortfolio />} />
        <Route path="/daily-report" element={<DailyReport />} />
        <Route path="/earnings" element={<Earnings />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/performance" element={<Performance />} />
        {isHO && <Route path="/approvals" element={<HOApprovals />} />}
        {isHO && <Route path="/officers" element={<ManageOfficers />} />}
        {isHO && <Route path="/financial-products" element={<FinancialProducts />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

function CenteredNote({ text }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5C6B64' }}>
      {text}
    </div>
  )
}
