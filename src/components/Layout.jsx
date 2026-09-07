import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import logo from '../assets/logo.png'

const NAV_BY_ROLE = {
  portfolio_officer: [
    { to: '/', label: "Today's Portfolio", end: true },
    { to: '/daily-report', label: 'Daily Report' },
    { to: '/earnings', label: 'Earnings' },
    { to: '/leaderboard', label: 'Leaderboard' },
    { to: '/performance', label: 'My Performance' },
  ],
  team_leader: [
    { to: '/', label: "Today's Portfolio", end: true },
    { to: '/daily-report', label: 'Daily Report' },
    { to: '/earnings', label: 'Earnings' },
    { to: '/leaderboard', label: 'Leaderboard' },
    { to: '/performance', label: 'My Performance' },
  ],
  branch_manager: [
    { to: '/', label: 'Branch Dashboard', end: true },
    { to: '/leaderboard', label: 'Leaderboard' },
  ],
  general_agent_manager: [
    { to: '/', label: 'National Dashboard', end: true },
    { to: '/leaderboard', label: 'Leaderboard' },
  ],
  head_office_admin: [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/approvals', label: 'Approvals' },
    { to: '/leaderboard', label: 'Leaderboard' },
  ],
}

export default function Layout() {
  const { officer, signOut } = useAuth()
  const items = NAV_BY_ROLE[officer?.role] ?? NAV_BY_ROLE.portfolio_officer

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src={logo} alt="" />
          <span>CirclesFundMe<br />Ops</span>
        </div>
        <nav>
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}
              className={({ isActive }) => (isActive ? 'active' : '')}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="who">
          <strong>{officer?.full_name}</strong>
          {roleLabel(officer?.role)}
          <div style={{ marginTop: '0.8rem' }}>
            <button className="secondary" style={{ width: '100%', color: 'white', borderColor: 'rgba(255,255,255,0.25)' }} onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}

function roleLabel(role) {
  return {
    portfolio_officer: 'Portfolio Officer',
    team_leader: 'Team Leader',
    branch_manager: 'Branch Manager',
    general_agent_manager: 'General Agent Manager',
    head_office_admin: 'Head Office Administrator',
  }[role] ?? ''
}
