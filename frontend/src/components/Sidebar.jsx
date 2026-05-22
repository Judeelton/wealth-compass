import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

function initials(user) {
  if (!user) return 'U'
  if (user.name) return user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  return (user.email?.[0] ?? 'U').toUpperCase()
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const I = {
  compass: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5.5-2.69l7.19-3.19 3.19-7.19-7.19 3.19-3.19 7.19zm5.5-4.64c-.59 0-1.07-.48-1.07-1.07s.48-1.07 1.07-1.07 1.07.48 1.07 1.07-.48 1.07-1.07 1.07z"/>
    </svg>
  ),
  grid: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
    </svg>
  ),
  wallet: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/>
      <circle cx="18" cy="14" r="1" fill="currentColor"/>
    </svg>
  ),
  list: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
      <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  ),
  bulb: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6m-5 4h4M12 2a7 7 0 0 1 7 7c0 3.1-2.1 5.7-5 6.7V18H10v-2.3C7.1 14.7 5 12.1 5 9a7 7 0 0 1 7-7z"/>
    </svg>
  ),
  clipboard: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
    </svg>
  ),
  logout: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
  upload: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  ),
  sun: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    </svg>
  ),
  moon: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  ),
  envelope: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  ),
  chevronLeft: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  ),
  chevronRight: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  ),
}

const NAV = [
  { label: 'Dashboard',        icon: I.grid,      to: '/dashboard'      },
  { label: 'My Budget',        icon: I.wallet,    to: '/budget-setup'   },
  { label: 'Envelopes',        icon: I.envelope,  to: '/envelope-setup' },
  { label: 'Upload Statement', icon: I.upload,    to: '/upload'         },
  { label: 'Transactions',     icon: I.list,      to: null              },
  { label: 'Insights',         icon: I.bulb,      to: '/insights'       },
  { label: 'Assessment',       icon: I.clipboard, to: '/assessment'     },
]

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export default function Sidebar({ user }) {
  const { logout } = useAuth()
  const { theme, toggleTheme } = useTheme()

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true' } catch { return false }
  })

  function toggle() {
    setCollapsed(c => {
      const next = !c
      try { localStorage.setItem('sidebar-collapsed', String(next)) } catch {}
      return next
    })
  }

  return (
    <aside
      className="flex-shrink-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden"
      style={{ width: collapsed ? 56 : 220, height: '100vh', transition: 'width 0.2s ease', flexShrink: 0 }}
    >
      {/* Logo */}
      <div
        className="flex items-center border-b border-gray-100 dark:border-gray-700 flex-shrink-0"
        style={{
          padding: collapsed ? '14px 0' : '14px 8px 14px 16px',
          gap: collapsed ? 0 : 10,
          justifyContent: collapsed ? 'center' : 'flex-start',
          minHeight: 52,
        }}
      >
        <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center text-white flex-shrink-0">
          {I.compass}
        </div>
        {!collapsed && (
          <span className="font-bold text-sm text-gray-900 dark:text-white tracking-tight leading-none flex-1 truncate">
            Wealth Compass
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 space-y-0.5 overflow-y-auto">
        {NAV.map(({ label, icon, to }) =>
          to ? (
            <NavLink
              key={label}
              to={to}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `flex items-center py-2 rounded-lg text-sm transition-colors mx-2 ${
                  collapsed ? 'justify-center px-2' : 'gap-2.5 px-2'
                } ${
                  isActive
                    ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-semibold'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                }`
              }
            >
              <span className="flex-shrink-0 w-4 flex items-center justify-center">{icon}</span>
              {!collapsed && label}
            </NavLink>
          ) : (
            <div
              key={label}
              title={collapsed ? label : undefined}
              className={`flex items-center py-2 rounded-lg text-sm text-gray-300 dark:text-gray-600 cursor-default select-none mx-2 ${
                collapsed ? 'justify-center px-2' : 'gap-2.5 px-2'
              }`}
            >
              <span className="flex-shrink-0 w-4 flex items-center justify-center">{icon}</span>
              {!collapsed && label}
            </div>
          )
        )}

        {/* Collapse toggle at bottom of nav */}
        <button
          onClick={toggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`flex items-center py-2 rounded-lg text-sm text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors mx-2 ${
            collapsed ? 'justify-center px-2' : 'gap-2.5 px-2'
          }`}
          style={{ width: 'calc(100% - 16px)' }}
        >
          <span className="flex-shrink-0 w-4 flex items-center justify-center">
            {collapsed ? I.chevronRight : I.chevronLeft}
          </span>
          {!collapsed && <span>Collapse</span>}
        </button>
      </nav>

      {/* Footer */}
      <div className="py-2 flex-shrink-0 border-t border-gray-100 dark:border-gray-700 space-y-0.5">
        <button
          onClick={toggleTheme}
          title={collapsed ? (theme === 'dark' ? 'Light mode' : 'Dark mode') : undefined}
          className={`flex items-center py-2 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 transition-colors mx-2 ${
            collapsed ? 'justify-center px-2' : 'gap-2.5 px-2'
          }`}
          style={{ width: 'calc(100% - 16px)' }}
        >
          <span className="flex-shrink-0 w-4 flex items-center justify-center">
            {theme === 'dark' ? I.sun : I.moon}
          </span>
          {!collapsed && <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
        </button>

        {collapsed ? (
          <div className="flex flex-col items-center gap-1 py-1">
            <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
              {initials(user)}
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
            >
              {I.logout}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 mx-2 px-2 py-1.5">
            <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {initials(user)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-900 dark:text-white truncate leading-tight">
                {user?.name ?? user?.email ?? 'User'}
              </p>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors flex-shrink-0"
            >
              {I.logout}
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
