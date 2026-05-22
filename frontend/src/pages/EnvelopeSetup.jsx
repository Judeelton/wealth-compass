import { useState, useEffect } from 'react'
import { useNavigate, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

const API_BASE  = 'http://127.0.0.1:8000'
const TOKEN_KEY = 'wc-token'

// ─── Bucket config ────────────────────────────────────────────────────────────

const BUCKETS = [
  {
    key: 'needs',
    label: 'Needs',
    pctKey: 'needs_pct',
    defaults: ['Rent', 'Groceries', 'Transport', 'Bills'],
    headerBg:   'bg-green-500',
    barColor:   '#22c55e',
    accent:     'text-green-700 dark:text-green-400',
    addBtn:     'text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900 dark:hover:bg-opacity-30 border-green-200 dark:border-green-800',
    ring:       'focus:ring-green-400 focus:border-green-400',
    overPct:    'text-red-600 dark:text-red-400',
    remainPct:  'text-green-600 dark:text-green-400',
  },
  {
    key: 'wants',
    label: 'Wants',
    pctKey: 'wants_pct',
    defaults: ['Eating out', 'Subscriptions', 'Shopping', 'Entertainment'],
    headerBg:   'bg-amber-500',
    barColor:   '#f59e0b',
    accent:     'text-amber-700 dark:text-amber-400',
    addBtn:     'text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900 dark:hover:bg-opacity-30 border-amber-200 dark:border-amber-800',
    ring:       'focus:ring-amber-400 focus:border-amber-400',
    overPct:    'text-red-600 dark:text-red-400',
    remainPct:  'text-amber-600 dark:text-amber-400',
  },
  {
    key: 'savings',
    label: 'Savings',
    pctKey: 'savings_pct',
    defaults: ['Emergency fund', 'House fund'],
    headerBg:   'bg-violet-700',
    barColor:   '#7c3aed',
    accent:     'text-violet-700 dark:text-violet-400',
    addBtn:     'text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900 dark:hover:bg-opacity-30 border-violet-200 dark:border-violet-800',
    ring:       'focus:ring-violet-400 focus:border-violet-400',
    overPct:    'text-red-600 dark:text-red-400',
    remainPct:  'text-violet-600 dark:text-violet-400',
  },
]

function makeEnvelopes(names) {
  return names.map((name, i) => ({ id: i + 1, name, amount: '' }))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  return '£' + Math.round(Math.abs(n)).toLocaleString('en-GB')
}

function parseAmt(v) {
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''))
  return isNaN(n) ? 0 : n
}

function bucketTotal(envs) {
  return envs.reduce((s, e) => s + parseAmt(e.amount), 0)
}

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
  envelope: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
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
  plus: (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
    </svg>
  ),
  x: (
    <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
    </svg>
  ),
  check: (
    <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
    </svg>
  ),
  spin: (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  ),
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const NAV = [
  { label: 'Dashboard',    icon: I.grid,      to: '/dashboard'       },
  { label: 'My Budget',    icon: I.wallet,    to: '/budget-setup'    },
  { label: 'Envelopes',    icon: I.envelope,  to: '/envelope-setup'  },
  { label: 'Transactions', icon: I.list,      to: null               },
  { label: 'Insights',     icon: I.bulb,      to: null               },
  { label: 'Assessment',   icon: I.clipboard, to: '/assessment'      },
]

function Sidebar({ user }) {
  const { logout } = useAuth()
  const { theme, toggleTheme } = useTheme()

  return (
    <aside
      className="flex-shrink-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col"
      style={{ width: 220, height: '100vh' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
        <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center text-white flex-shrink-0">
          {I.compass}
        </div>
        <span className="font-bold text-sm text-gray-900 dark:text-white tracking-tight">Wealth Compass</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {NAV.map(({ label, icon, to }) =>
          to ? (
            <NavLink
              key={label}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-semibold'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                }`
              }
            >
              <span className="flex-shrink-0">{icon}</span>
              {label}
            </NavLink>
          ) : (
            <div
              key={label}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 dark:text-gray-600 cursor-default select-none"
            >
              <span className="flex-shrink-0">{icon}</span>
              {label}
            </div>
          )
        )}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4 space-y-1 flex-shrink-0 border-t border-gray-100 dark:border-gray-700 pt-3">
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
        >
          {theme === 'dark' ? I.sun : I.moon}
          <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>

        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
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
            className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900 dark:hover:bg-opacity-30 transition-colors"
          >
            {I.logout}
          </button>
        </div>
      </div>
    </aside>
  )
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator() {
  return (
    <div className="flex items-center gap-2">
      {/* Step 1 — done */}
      <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
        {I.check}
      </div>
      <span className="text-xs font-medium text-gray-400 dark:text-gray-500 hidden sm:block">Assessment</span>
      <div className="w-6 h-px bg-green-300 dark:bg-green-800" />

      {/* Step 2 — done */}
      <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
        {I.check}
      </div>
      <span className="text-xs font-medium text-gray-400 dark:text-gray-500 hidden sm:block">Budget</span>
      <div className="w-6 h-px bg-indigo-200 dark:bg-indigo-900" />

      {/* Step 3 — current */}
      <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
        <span className="text-white text-xs font-bold leading-none">3</span>
      </div>
      <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hidden sm:block">Envelopes</span>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="flex-1 p-6 animate-pulse">
      <div className="grid grid-cols-3 gap-4 h-full">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-gray-200 dark:bg-gray-700 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

// ─── No-budget state ──────────────────────────────────────────────────────────

function NoBudget({ navigate }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-xs px-6">
        <div className="w-14 h-14 bg-indigo-100 dark:bg-indigo-900 dark:bg-opacity-40 rounded-2xl flex items-center justify-center mx-auto mb-4 text-indigo-600 dark:text-indigo-400">
          {I.wallet}
        </div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Set up your budget first</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-5">
          You need a budget before you can plan your envelopes.
        </p>
        <button
          onClick={() => navigate('/budget-setup')}
          className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          Set up budget →
        </button>
      </div>
    </div>
  )
}

// ─── Envelope column ──────────────────────────────────────────────────────────

function EnvelopeColumn({ bucket, budget, envelopes, onUpdate, onDelete, onAdd }) {
  const income     = budget?.income ?? 0
  const pct        = budget?.[bucket.pctKey] ?? 0
  const budgetAmt  = income * pct / 100
  const allocated  = bucketTotal(envelopes)
  const remaining  = budgetAmt - allocated
  const isOver     = allocated > budgetAmt && budgetAmt > 0
  const barWidth   = budgetAmt > 0 ? Math.min(100, (allocated / budgetAmt) * 100) : 0
  const barFill    = isOver ? '#ef4444' : barWidth > 85 ? '#f59e0b' : bucket.barColor

  const inputBase = `flex-1 min-w-0 px-2.5 py-1.5 text-sm border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-1 border-gray-200 dark:border-gray-600 ${bucket.ring} transition-colors`
  const amtBase   = `w-28 px-2 py-1.5 text-sm text-right border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-1 border-gray-200 dark:border-gray-600 ${bucket.ring} transition-colors`

  return (
    <div className="flex flex-col bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">

      {/* Coloured header */}
      <div className={`${bucket.headerBg} px-4 py-3.5 flex-shrink-0`}>
        <div className="flex items-center justify-between">
          <span className="font-bold text-white text-base">{bucket.label}</span>
          <span className="text-white text-opacity-90 text-sm font-medium">
            {budgetAmt > 0 ? fmt(budgetAmt) + '/month' : '—'}
          </span>
        </div>
        {budgetAmt > 0 && (
          <p className="text-white text-opacity-75 text-xs mt-0.5">
            {pct}% of your income
          </p>
        )}
      </div>

      {/* Scrollable envelope list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
        {envelopes.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">
            No envelopes yet — add one below
          </p>
        )}

        {envelopes.map(env => (
          <div key={env.id} className="flex items-center gap-2">
            {/* Name input */}
            <input
              type="text"
              value={env.name}
              onChange={e => onUpdate(env.id, 'name', e.target.value)}
              placeholder="Envelope name"
              className={inputBase}
            />

            {/* Amount input with £ prefix */}
            <div className="relative flex-shrink-0">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-500 pointer-events-none select-none">
                £
              </span>
              <input
                type="number"
                min="0"
                step="1"
                value={env.amount}
                onChange={e => onUpdate(env.id, 'amount', e.target.value)}
                placeholder="0"
                className={amtBase + ' pl-5'}
              />
            </div>

            {/* Delete */}
            <button
              onClick={() => onDelete(env.id)}
              aria-label="Remove envelope"
              className="flex-shrink-0 p-1 rounded text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900 dark:hover:bg-opacity-20 transition-colors"
            >
              {I.x}
            </button>
          </div>
        ))}

        {/* Add envelope button */}
        <button
          onClick={onAdd}
          className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 mt-1 rounded-lg text-xs font-semibold border border-dashed transition-colors ${bucket.addBtn}`}
        >
          {I.plus}
          Add envelope
        </button>
      </div>

      {/* Progress footer */}
      <div className="flex-shrink-0 border-t border-gray-100 dark:border-gray-700 px-4 py-3 space-y-2">
        {/* Bar */}
        <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
          <div
            className="h-2 rounded-full transition-all duration-300"
            style={{ width: `${barWidth}%`, backgroundColor: barFill }}
          />
        </div>

        {/* Amounts row */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-500 dark:text-gray-400">Allocated </span>
            <span className="text-xs font-bold text-gray-900 dark:text-white">
              {allocated > 0 ? fmt(allocated) : '£0'}
            </span>
          </div>
          <div className="text-right">
            {budgetAmt > 0 && (
              isOver ? (
                <span className={`text-xs font-semibold ${bucket.overPct}`}>
                  {fmt(Math.abs(remaining))} over
                </span>
              ) : (
                <span className={`text-xs font-semibold ${bucket.remainPct}`}>
                  {fmt(remaining)} left
                </span>
              )
            )}
          </div>
        </div>

        {/* Percentage */}
        {budgetAmt > 0 && (
          <div className="text-center">
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {Math.round(barWidth)}% of {fmt(budgetAmt)} budgeted
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EnvelopeSetup() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [loading,   setLoading]   = useState(true)
  const [budget,    setBudget]    = useState(null)
  const [envelopes, setEnvelopes] = useState({
    needs:   makeEnvelopes(BUCKETS[0].defaults),
    wants:   makeEnvelopes(BUCKETS[1].defaults),
    savings: makeEnvelopes(BUCKETS[2].defaults),
  })
  const [saving,    setSaving]    = useState(false)
  const [saveError, setSaveError] = useState('')

  // ── Fetch budget + existing envelopes ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const token = localStorage.getItem(TOKEN_KEY)
        const h = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        const [budgetRes, envRes] = await Promise.all([
          fetch(`${API_BASE}/api/budget`, { headers: h }),
          fetch(`${API_BASE}/api/envelopes`, { headers: h }).catch(() => null),
        ])
        if (budgetRes.ok && !cancelled) {
          const budgets = await budgetRes.json()
          setBudget(budgets[0] ?? null)
        }
        if (envRes?.ok && !cancelled) {
          const envData = await envRes.json().catch(() => [])
          if (Array.isArray(envData) && envData.length > 0) {
            const grouped = { needs: [], wants: [], savings: [] }
            envData.forEach(env => {
              const key = env.category === 'need' ? 'needs' : env.category === 'want' ? 'wants' : 'savings'
              grouped[key].push({ id: env.id, name: env.name, amount: env.allocated_amount || '' })
            })
            if (!cancelled) setEnvelopes(grouped)
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // ── Envelope handlers ───────────────────────────────────────────────────────
  function updateEnvelope(bucketKey, id, field, value) {
    setEnvelopes(prev => ({
      ...prev,
      [bucketKey]: prev[bucketKey].map(e => e.id === id ? { ...e, [field]: value } : e),
    }))
  }

  function deleteEnvelope(bucketKey, id) {
    setEnvelopes(prev => ({
      ...prev,
      [bucketKey]: prev[bucketKey].filter(e => e.id !== id),
    }))
  }

  function addEnvelope(bucketKey) {
    setEnvelopes(prev => ({
      ...prev,
      [bucketKey]: [...prev[bucketKey], { id: Date.now(), name: '', amount: '' }],
    }))
  }

  // ── Save all envelopes then navigate ───────────────────────────────────────
  async function handleSave() {
    setSaving(true)
    setSaveError('')
    try {
      const token = localStorage.getItem(TOKEN_KEY)
      const payload = [
        ...envelopes.needs.map(e => ({ name: e.name.trim(), category: 'need', allocated_amount: parseAmt(e.amount) })),
        ...envelopes.wants.map(e => ({ name: e.name.trim(), category: 'want', allocated_amount: parseAmt(e.amount) })),
        ...envelopes.savings.map(e => ({ name: e.name.trim(), category: 'saving', allocated_amount: parseAmt(e.amount) })),
      ].filter(e => e.name)
      const res = await fetch(`${API_BASE}/api/envelopes/bulk-save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to save envelopes. Please try again.')
      navigate('/dashboard')
    } catch (err) {
      setSaveError(err.message || 'Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── Totals for bottom bar ───────────────────────────────────────────────────
  const totalAllocated = Object.values(envelopes).flat().reduce((s, e) => s + parseAmt(e.amount), 0)
  const income = budget?.income ?? 0

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex overflow-hidden" style={{ height: '100vh' }}>
      <Sidebar user={user} />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">

        {/* Topbar */}
        <div className="flex-shrink-0 px-6 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
              Set up your envelopes
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Create spending categories within each budget bucket
            </p>
          </div>
          <StepIndicator />
        </div>

        {/* Three-column grid or states */}
        {loading ? (
          <Skeleton />
        ) : !budget ? (
          <NoBudget navigate={navigate} />
        ) : (
          <div className="flex-1 overflow-hidden p-6 min-h-0">
            <div className="grid grid-cols-3 gap-4 h-full">
              {BUCKETS.map(bucket => (
                <EnvelopeColumn
                  key={bucket.key}
                  bucket={bucket}
                  budget={budget}
                  envelopes={envelopes[bucket.key]}
                  onUpdate={(id, field, value) => updateEnvelope(bucket.key, id, field, value)}
                  onDelete={id => deleteEnvelope(bucket.key, id)}
                  onAdd={() => addEnvelope(bucket.key)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Bottom bar */}
        <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div>
              <span className="text-xs text-gray-500 dark:text-gray-400">Total allocated </span>
              <span className="text-sm font-bold text-gray-900 dark:text-white">
                {fmt(totalAllocated)}
              </span>
              {income > 0 && (
                <>
                  <span className="text-xs text-gray-400 dark:text-gray-500 mx-1">of</span>
                  <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">{fmt(income)}</span>
                </>
              )}
            </div>

            {income > 0 && totalAllocated > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-32 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                  <div
                    className="h-1.5 rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, (totalAllocated / income) * 100)}%`,
                      backgroundColor: totalAllocated > income ? '#ef4444' : '#6366f1',
                    }}
                  />
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {Math.round((totalAllocated / income) * 100)}%
                </span>
              </div>
            )}

            {income > 0 && (
              <span className={`text-xs font-medium ${totalAllocated > income ? 'text-red-500 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>
                {totalAllocated > income
                  ? `${fmt(totalAllocated - income)} over income`
                  : `${fmt(income - totalAllocated)} unallocated`}
              </span>
            )}
          </div>

          {saveError && (
            <p className="text-xs text-red-500 dark:text-red-400 max-w-xs text-right">{saveError}</p>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {saving ? <>{I.spin} Saving…</> : 'Go to my dashboard →'}
          </button>
        </div>
      </div>
    </div>
  )
}
