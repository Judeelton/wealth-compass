import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

const API_BASE  = 'http://127.0.0.1:8000'
const TOKEN_KEY = 'wc-token'

const ENVELOPES = {
  need:   ['Rent', 'Groceries', 'Transport', 'Bills', 'Healthcare', 'Other'],
  want:   ['Eating out', 'Subscriptions', 'Shopping', 'Entertainment', 'Hobbies', 'Other'],
  saving: ['Emergency fund', 'House fund', 'Holiday fund', 'Other'],
}

const CREDIT_LABELS = {
  salary:       'Salary',
  debt_repaid:  'Money owed back',
  refund:       'Refund',
  extra_income: 'Extra income',
}

// Envelopes that belong to Needs category
const NEED_ENVELOPES = [
  'Rent', 'Groceries', 'Transport', 'Bills',
  'Healthcare', 'Education', 'Other Need',
]

// Envelopes that belong to Wants category
const WANT_ENVELOPES = [
  'Eating out', 'Subscriptions', 'Shopping',
  'Entertainment', 'Other Want',
]

// Envelopes that belong to Savings category
const SAVING_ENVELOPES = [
  'House fund', 'Emergency fund',
  'Car fund', 'Holiday fund', 'Other Saving',
]

// Only show envelopes that match the selected category
// so the user cannot assign a Need transaction to a Savings envelope
const getEnvelopesForTag = (tag) => {
  if (tag === 'need')   return NEED_ENVELOPES
  if (tag === 'want')   return WANT_ENVELOPES
  if (tag === 'saving') return SAVING_ENVELOPES
  return [] // Return empty if no tag selected yet
}

// Tag button styles shared between DebitCard and the merchant group cards
const TAG_CFG = {
  need:   { label: 'Need',   active: 'bg-green-500 text-white border-green-500',   idle: 'border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900 dark:hover:bg-opacity-30' },
  want:   { label: 'Want',   active: 'bg-amber-500 text-white border-amber-500',   idle: 'border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900 dark:hover:bg-opacity-30' },
  saving: { label: 'Saving', active: 'bg-violet-600 text-white border-violet-600', idle: 'border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900 dark:hover:bg-opacity-30' },
}

// Group transactions by merchant so the user can tag them all at once.
// We normalise to lowercase + trim so "TESCO" and "Tesco " count as the same merchant.
// Only merchants that appear more than once get grouped — single transactions go
// straight to the manual tagging list below.
function groupByMerchant(txList) {
  const groups = {}
  txList.forEach(tx => {
    const key = tx.description.toLowerCase().trim()
    if (!groups[key]) groups[key] = []
    groups[key].push(tx)
  })
  return Object.entries(groups)
    .filter(([, txs]) => txs.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  return '£' + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtBytes(b) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

function initials(user) {
  if (!user) return 'U'
  if (user.name) return user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  return (user.email?.[0] ?? 'U').toUpperCase()
}

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
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
  upload: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
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
  pdf: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  ),
  check: (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
    </svg>
  ),
  spin: (
    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  ),
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const NAV = [
  { label: 'Dashboard',         icon: I.grid,      to: '/dashboard'      },
  { label: 'My Budget',         icon: I.wallet,    to: '/budget-setup'   },
  { label: 'Envelopes',         icon: I.envelope,  to: '/envelope-setup' },
  { label: 'Upload Statement',  icon: I.upload,    to: '/upload'         },
  { label: 'Transactions',      icon: I.list,      to: null              },
  { label: 'Insights',          icon: I.bulb,      to: null              },
  { label: 'Assessment',        icon: I.clipboard, to: '/assessment'     },
]

function Sidebar({ user }) {
  const { logout } = useAuth()
  const { theme, toggleTheme } = useTheme()

  return (
    <aside
      className="flex-shrink-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col"
      style={{ width: 220, height: '100vh' }}
    >
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
        <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center text-white flex-shrink-0">
          {I.compass}
        </div>
        <span className="font-bold text-sm text-gray-900 dark:text-white tracking-tight">Wealth Compass</span>
      </div>

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
            <div key={label} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 dark:text-gray-600 cursor-default select-none">
              <span className="flex-shrink-0">{icon}</span>
              {label}
            </div>
          )
        )}
      </nav>

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

// ─── Drop zone ────────────────────────────────────────────────────────────────

function DropZone({ onFile, file }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  const accept = useCallback((f) => {
    if (f && f.type === 'application/pdf') onFile(f)
  }, [onFile])

  function onDragOver(e) { e.preventDefault(); setDragging(true) }
  function onDragLeave()  { setDragging(false) }
  function onDrop(e)      { e.preventDefault(); setDragging(false); accept(e.dataTransfer.files[0]) }

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={`
        relative flex flex-col items-center justify-center gap-4 cursor-pointer
        rounded-2xl border-2 border-dashed transition-all duration-200 p-12
        ${dragging
          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 dark:bg-opacity-30'
          : file
            ? 'border-green-400 bg-green-50 dark:bg-green-900 dark:bg-opacity-20'
            : 'border-indigo-300 dark:border-indigo-700 bg-white dark:bg-gray-800 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950 dark:hover:bg-opacity-20'
        }
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={e => accept(e.target.files[0])}
      />

      {file ? (
        <>
          <div className="w-14 h-14 rounded-xl bg-green-100 dark:bg-green-900 dark:bg-opacity-40 flex items-center justify-center text-green-600 dark:text-green-400">
            {I.pdf}
          </div>
          <div className="text-center">
            <p className="font-semibold text-gray-900 dark:text-white text-sm">{file.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{fmtBytes(file.size)}</p>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">Click to choose a different file</p>
        </>
      ) : (
        <>
          <div className="w-14 h-14 rounded-xl bg-indigo-100 dark:bg-indigo-900 dark:bg-opacity-40 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            {I.upload}
          </div>
          <div className="text-center">
            <p className="font-semibold text-gray-900 dark:text-white">Upload your bank statement</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Drag and drop your PDF here, or click to browse
            </p>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full">
            PDF files only · Max 10 MB
          </p>
        </>
      )}
    </div>
  )
}

// ─── Debit card ───────────────────────────────────────────────────────────────

function DebitCard({ tx, tag, onTag, onEnvelope, envList }) {
  const tagCfg = {
    need:   { label: 'Need',    active: 'bg-green-500 text-white border-green-500', idle: 'border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900 dark:hover:bg-opacity-30' },
    want:   { label: 'Want',   active: 'bg-amber-500 text-white border-amber-500',  idle: 'border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900 dark:hover:bg-opacity-30' },
    saving: { label: 'Saving', active: 'bg-violet-600 text-white border-violet-600', idle: 'border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900 dark:hover:bg-opacity-30' },
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl border transition-colors ${
      tag?.need_or_want ? 'border-gray-200 dark:border-gray-700' : 'border-gray-200 dark:border-gray-700'
    } p-4`}>
      <div className="flex items-start gap-3">
        {/* Date badge */}
        <div className="flex-shrink-0 text-center bg-gray-50 dark:bg-gray-700 rounded-lg px-2.5 py-1.5 min-w-[44px]">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 leading-tight">{fmtDate(tx.date)}</p>
        </div>

        {/* Description */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{tx.description}</p>
          {tag?.need_or_want && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {tag.envelope ? `→ ${tag.envelope}` : 'Select an envelope'}
            </p>
          )}
        </div>

        {/* Amount */}
        <span className="flex-shrink-0 text-sm font-bold text-rose-600 dark:text-rose-400">
          −{fmt(tx.amount)}
        </span>
      </div>

      {/* Tag buttons */}
      <div className="flex items-center gap-2 mt-3">
        <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">Tag:</span>
        {Object.entries(tagCfg).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => onTag(key)}
            className={`px-3 py-1 text-xs font-semibold rounded-full border transition-all ${
              tag?.need_or_want === key ? cfg.active : `bg-transparent ${cfg.idle}`
            }`}
          >
            {cfg.label}
          </button>
        ))}
        {tag?.need_or_want && (
          <button
            onClick={() => onTag(null)}
            className="ml-auto text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Envelope dropdown — shown once tagged */}
      {tag?.need_or_want && (
        <div className="mt-2">
          <select
            value={tag.envelope ?? ''}
            onChange={e => onEnvelope(e.target.value)}
            className="w-full text-xs px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-400 transition-colors"
          >
            <option value="">— Select envelope —</option>
            {(envList ?? []).map(env => (
              <option key={env} value={env}>{env}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

// ─── Credit card ──────────────────────────────────────────────────────────────

function CreditCard({ tx, creditType, onCreditType }) {
  const btns = [
    { key: 'salary',       label: 'Salary',           color: 'green'  },
    { key: 'debt_repaid',  label: 'Money owed back',  color: 'blue'   },
    { key: 'extra_income', label: 'Extra income',     color: 'amber'  },
    { key: 'skip',         label: 'Skip',             color: 'gray'   },
  ]

  const colorMap = {
    green: { active: 'bg-green-500 text-white border-green-500',  idle: 'border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900 dark:hover:bg-opacity-30' },
    blue:  { active: 'bg-blue-500 text-white border-blue-500',    idle: 'border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900 dark:hover:bg-opacity-30' },
    amber: { active: 'bg-amber-500 text-white border-amber-500',  idle: 'border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900 dark:hover:bg-opacity-30' },
    gray:  { active: 'bg-gray-400 text-white border-gray-400',    idle: 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700' },
  }

  const current = creditType ?? tx.credit_type

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 text-center bg-gray-50 dark:bg-gray-700 rounded-lg px-2.5 py-1.5 min-w-[44px]">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 leading-tight">{fmtDate(tx.date)}</p>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{tx.description}</p>
          {current && current !== 'skip' && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              Classified as: {CREDIT_LABELS[current] ?? current}
            </p>
          )}
        </div>
        <span className="flex-shrink-0 text-sm font-bold text-green-600 dark:text-green-400">
          +{fmt(tx.amount)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">Type:</span>
        {btns.map(({ key, label, color }) => {
          const cfg = colorMap[color]
          const isActive = current === key
          return (
            <button
              key={key}
              onClick={() => onCreditType(key === current ? null : key)}
              className={`px-3 py-1 text-xs font-semibold rounded-full border transition-all ${
                isActive ? cfg.active : `bg-transparent ${cfg.idle}`
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Upload() {
  const { user } = useAuth()
  const navigate  = useNavigate()

  const [file,        setFile]        = useState(null)
  const [uploading,   setUploading]   = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [result,      setResult]      = useState(null)   // parsed PDF result
  const [budget,      setBudget]      = useState(null)   // user's latest budget

  // Per-transaction local state: { [idx]: { need_or_want, envelope } }
  const [tags,        setTags]        = useState({})
  // Credit type overrides: { [idx]: 'salary'|'debt_repaid'|'extra_income'|'skip'|null }
  const [creditTypes, setCreditTypes] = useState({})

  const [saving,      setSaving]      = useState(false)
  const [saveError,   setSaveError]   = useState('')
  const [saved,       setSaved]       = useState(false)

  // Merchant groups computed after PDF extraction — array of [merchantKey, txArray] pairs
  const [merchantGroups,     setMerchantGroups]     = useState([])
  // Batch tags the user has chosen per merchant: { [merchantKey]: { tag, envelope } }
  const [batchTags,          setBatchTags]          = useState({})
  // Whether to show the batch section — user can hide it with "Skip and tag manually"
  const [showMerchantGroups, setShowMerchantGroups] = useState(true)
  // Envelope names fetched from API, grouped by category — null until loaded
  const [fetchedEnvelopes,   setFetchedEnvelopes]   = useState(null)

  // Fetch budget and saved envelopes on mount
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) return
    const h = { 'Authorization': `Bearer ${token}` }
    Promise.all([
      fetch(`${API_BASE}/api/budget`,    { headers: h }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${API_BASE}/api/envelopes`, { headers: h }).then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([budgetData, envData]) => {
      setBudget(Array.isArray(budgetData) ? (budgetData[0] ?? null) : null)
      if (Array.isArray(envData) && envData.length > 0) {
        const grouped = { need: [], want: [], saving: [] }
        envData.forEach(env => {
          if (grouped[env.category]) grouped[env.category].push(env.name)
        })
        setFetchedEnvelopes(grouped)
      }
    })
  }, [])

  function handleFile(f) {
    setFile(f)
    setResult(null)
    setUploadError('')
    setTags({})
    setCreditTypes({})
    setSaved(false)
    // Reset batch tagging state whenever a new file is picked
    setMerchantGroups([])
    setBatchTags({})
    setShowMerchantGroups(true)
  }

  async function handleExtract() {
    if (!file) return
    setUploading(true)
    setUploadError('')

    try {
      const token = localStorage.getItem(TOKEN_KEY)
      const form  = new FormData()
      form.append('file', file)

      const res = await fetch(`${API_BASE}/api/upload/statement`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: form,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const detail = data.detail
        throw new Error(
          typeof detail === 'string' ? detail :
          Array.isArray(detail) ? detail.map(e => e.msg ?? JSON.stringify(e)).join('; ') :
          'Could not parse this PDF. Try a different statement.'
        )
      }

      const parsed = await res.json()

      // Pre-fill credit types from parser classification
      const initCreditTypes = {}
      parsed.transactions.forEach((tx, i) => {
        if (tx.transaction_type === 'credit' && tx.credit_type) {
          initCreditTypes[i] = tx.credit_type
        }
      })
      setCreditTypes(initCreditTypes)
      setResult(parsed)

      // After we have the transaction list, group debit transactions by merchant.
      // We only look at debits here because credits (salary, refunds) don't get
      // tagged with Need/Want/Saving, so grouping them would be confusing.
      const parsedDebits = parsed.transactions.filter(tx => tx.transaction_type === 'debit')
      const groups = groupByMerchant(parsedDebits)
      setMerchantGroups(groups)
      setBatchTags({})
      setShowMerchantGroups(true)
    } catch (err) {
      setUploadError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  function handleTag(idx, value) {
    setTags(prev => ({
      ...prev,
      [idx]: value === null ? undefined : { need_or_want: value, envelope: prev[idx]?.envelope ?? '' },
    }))
  }

  function handleEnvelope(idx, value) {
    setTags(prev => ({
      ...prev,
      [idx]: { ...prev[idx], envelope: value },
    }))
  }

  function handleCreditType(idx, value) {
    setCreditTypes(prev => ({ ...prev, [idx]: value }))
  }

  // Update the tag or envelope for a merchant's batch entry.
  // When the tag changes we clear the envelope — the previous envelope may
  // not exist in the new tag's list, so it's safer to make the user re-pick.
  function handleBatchTag(merchantKey, field, value) {
    setBatchTags(prev => {
      const current = prev[merchantKey] ?? {}
      const updated = field === 'tag'
        ? { tag: value, envelope: '' }   // reset envelope when tag changes
        : { ...current, [field]: value }
      return { ...prev, [merchantKey]: updated }
    })
  }

  // Apply the batch tag to every transaction from this merchant.
  // We loop through batchTags, find all debit transactions whose description
  // normalises to the same key, and write to the main tags state so the
  // individual transaction cards below immediately show as tagged.
  // Only merchants with both tag AND envelope set are applied.
  function applyBatchTags() {
    setTags(prev => {
      const next = { ...prev }
      Object.entries(batchTags).forEach(([merchantKey, batch]) => {
        if (!batch.tag || !batch.envelope) return
        debitIdxs.forEach(({ tx, i }) => {
          if (tx.description.toLowerCase().trim() === merchantKey) {
            next[i] = { need_or_want: batch.tag, envelope: batch.envelope }
          }
        })
      })
      return next
    })
    // Hide the batch section after applying — the individual cards below now show the tags
    setShowMerchantGroups(false)
  }

  async function handleSave() {
    if (!budget) {
      setSaveError('No budget found. Set up your budget first.')
      return
    }

    const debits = (result?.transactions ?? [])
      .map((tx, i) => ({ tx, i }))
      .filter(({ tx }) => tx.transaction_type === 'debit')

    const toSave = debits.filter(({ i }) => tags[i]?.need_or_want)

    if (toSave.length === 0) {
      setSaveError('Tag at least one spending transaction before saving.')
      return
    }

    setSaving(true)
    setSaveError('')

    const token = localStorage.getItem(TOKEN_KEY)
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    }

    let failed = 0
    for (const { tx, i } of toSave) {
      const tag = tags[i]
      try {
        const res = await fetch(`${API_BASE}/api/expenses`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            budget_id:    budget.id,
            title:        tx.description,
            amount:       tx.amount,
            category:     tag.envelope || (tag.need_or_want === 'need' ? 'Essentials' : tag.need_or_want === 'want' ? 'Lifestyle' : 'Savings'),
            need_or_want: tag.need_or_want,
            envelope:     tag.envelope || null,
          }),
        })
        if (!res.ok) failed++
      } catch {
        failed++
      }
    }

    setSaving(false)

    if (failed === 0) {
      // Automatically regenerate insights after new transactions are saved
      // so the dashboard always shows fresh personalised advice
      try {
        const budgetRes = await fetch(`${API_BASE}/api/budget`, {
          headers: { 'Authorization': `Bearer ${token}` },
        })
        const budgets = await budgetRes.json()
        if (budgets?.length > 0) {
          await fetch(`${API_BASE}/api/insights/generate`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ month: budgets[0].month }),
          })
        }
      } catch { /* insight regeneration is non-fatal — dashboard will still work */ }

      setSaved(true)
      setTimeout(() => navigate('/dashboard'), 1200)
    } else {
      setSaveError(`${failed} of ${toSave.length} transactions failed to save. The rest were saved.`)
    }
  }

  // Returns envelope names for a tag — prefers DB-fetched names, falls back to hardcoded
  function envsByTag(tag) {
    if (!tag) return []
    if (fetchedEnvelopes?.[tag]?.length) return fetchedEnvelopes[tag]
    return getEnvelopesForTag(tag)
  }

  // ── Derived counts ──────────────────────────────────────────────────────────
  const allTx      = result?.transactions ?? []
  const debits     = allTx.filter(tx => tx.transaction_type === 'debit')
  const credits    = allTx.filter(tx => tx.transaction_type === 'credit')
  const debitIdxs  = allTx.map((tx, i) => ({ tx, i })).filter(({ tx }) => tx.transaction_type === 'debit')
  const creditIdxs = allTx.map((tx, i) => ({ tx, i })).filter(({ tx }) => tx.transaction_type === 'credit')
  const taggedCount = debitIdxs.filter(({ i }) => tags[i]?.need_or_want).length

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex overflow-hidden" style={{ height: '100vh' }}>
      <Sidebar user={user} />

      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">

        {/* Topbar */}
        <div className="flex-shrink-0 px-6 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Upload Statement</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Import transactions from a PDF bank statement. Your file is never stored.
          </p>
        </div>

        {/* Scrollable main */}
        <div className="flex-1 overflow-y-auto p-6 pb-28">

          {/* ── Upload zone ───────────────────────────────────────────────── */}
          {!result && (
            <div className="max-w-2xl mx-auto space-y-4">
              <DropZone file={file} onFile={handleFile} />

              {uploadError && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 dark:bg-rose-900 dark:bg-opacity-20 border border-rose-200 dark:border-rose-800">
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="#ef4444" style={{ flexShrink: 0, marginTop: 2 }}>
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                  </svg>
                  <p className="text-sm text-rose-700 dark:text-rose-400">{uploadError}</p>
                </div>
              )}

              {file && (
                <button
                  onClick={handleExtract}
                  disabled={uploading}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
                >
                  {uploading ? (
                    <>{I.spin} Reading your statement…</>
                  ) : (
                    <>{I.upload} Extract transactions</>
                  )}
                </button>
              )}

              <p className="text-center text-xs text-gray-400 dark:text-gray-600">
                Privacy first — your PDF is processed in memory and never stored on our servers
              </p>
            </div>
          )}

          {/* ── Results ───────────────────────────────────────────────────── */}
          {result && (
            <div className="max-w-3xl mx-auto space-y-6">

              {/* Summary banner */}
              <div className="bg-indigo-50 dark:bg-indigo-950 dark:bg-opacity-40 border border-indigo-200 dark:border-indigo-800 rounded-xl px-5 py-4 flex flex-wrap items-center gap-4 justify-between">
                <div>
                  <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">
                    {result.summary.transaction_count} transactions found · {result.summary.date_range}
                  </p>
                  <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">
                    Spent {fmt(result.summary.total_debits)} · Received {fmt(result.summary.total_credits)}
                  </p>
                </div>
                <button
                  onClick={() => { setResult(null); setFile(null) }}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Upload different file
                </button>
              </div>

              {/* ── Merchant grouping section ──────────────────────────────── */}
              {/* Only shown when we found merchants that appear more than once */}
              {showMerchantGroups && merchantGroups.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0" />
                      Repeated merchants ({merchantGroups.length} found)
                      <span className="ml-1 text-xs font-normal text-gray-400 dark:text-gray-500">
                        — tag all transactions from the same place at once
                      </span>
                    </h2>
                    {/* When the user clicks this, we just hide the section — nothing is applied.
                        They'll tag every transaction manually in the list below instead. */}
                    <button
                      onClick={() => setShowMerchantGroups(false)}
                      className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex-shrink-0"
                    >
                      Skip and tag manually
                    </button>
                  </div>

                  <div className="space-y-2 mb-3">
                    {merchantGroups.map(([merchantKey, txs]) => {
                      const batch = batchTags[merchantKey] ?? {}
                      // Card turns green once both tag AND envelope are chosen
                      const isComplete = !!(batch.tag && batch.envelope)
                      const total = txs.reduce((sum, tx) => sum + tx.amount, 0)

                      return (
                        <div
                          key={merchantKey}
                          className={`bg-white dark:bg-gray-800 rounded-xl border p-4 transition-colors ${
                            isComplete
                              ? 'border-green-300 dark:border-green-700'
                              : 'border-gray-200 dark:border-gray-700'
                          }`}
                        >
                          {/* Merchant name, transaction count, and total spend */}
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div>
                              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                {txs[0].description}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                {txs.length} transactions · {fmt(total)} total
                              </p>
                            </div>
                            {/* Green checkmark appears when the card is fully tagged */}
                            {isComplete && (
                              <div className="flex-shrink-0 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white">
                                {I.check}
                              </div>
                            )}
                          </div>

                          {/* Tag buttons — same style as the individual debit cards */}
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">Tag:</span>
                            {Object.entries(TAG_CFG).map(([key, cfg]) => (
                              <button
                                key={key}
                                onClick={() =>
                                  handleBatchTag(merchantKey, 'tag', batch.tag === key ? undefined : key)
                                }
                                className={`px-3 py-1 text-xs font-semibold rounded-full border transition-all ${
                                  batch.tag === key ? cfg.active : `bg-transparent ${cfg.idle}`
                                }`}
                              >
                                {cfg.label}
                              </button>
                            ))}
                          </div>

                          {/* Only show envelopes that match the selected category
                              so user cannot assign a Need transaction to a Savings envelope */}
                          <select
                            value={batch.envelope ?? ''}
                            disabled={!batch.tag}
                            onChange={e => handleBatchTag(merchantKey, 'envelope', e.target.value)}
                            className="w-full text-xs px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <option value="">
                              {batch.tag ? '— Select envelope —' : 'Select a tag first'}
                            </option>
                            {getEnvelopesForTag(batch.tag).map(env => (
                              <option key={env} value={env}>{env}</option>
                            ))}
                          </select>
                        </div>
                      )
                    })}
                  </div>

                  {/* Apply button — only appears once at least one merchant is fully tagged.
                      The count shows how many merchants have both tag and envelope ready. */}
                  {(() => {
                    const readyCount = Object.values(batchTags).filter(b => b.tag && b.envelope).length
                    return readyCount > 0 ? (
                      <button
                        onClick={applyBatchTags}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl transition-colors"
                      >
                        Apply batch tags ({readyCount} merchant{readyCount === 1 ? '' : 's'})
                      </button>
                    ) : null
                  })()}
                </section>
              )}

              {/* Spending transactions */}
              {debits.length > 0 && (
                <section>
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0" />
                    Spending ({debits.length} transactions)
                    <span className="ml-auto text-xs font-normal text-gray-400 dark:text-gray-500">
                      Tag each as Need, Want, or Saving
                    </span>
                  </h2>
                  <div className="space-y-2">
                    {debitIdxs.map(({ tx, i }) => (
                      <DebitCard
                        key={i}
                        tx={tx}
                        tag={tags[i]}
                        onTag={val => handleTag(i, val)}
                        onEnvelope={val => handleEnvelope(i, val)}
                        envList={envsByTag(tags[i]?.need_or_want)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Income transactions */}
              {credits.length > 0 && (
                <section>
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                    Income ({credits.length} transactions)
                    <span className="ml-auto text-xs font-normal text-gray-400 dark:text-gray-500">
                      Confirm the type · income is not saved as an expense
                    </span>
                  </h2>
                  <div className="space-y-2">
                    {creditIdxs.map(({ tx, i }) => (
                      <CreditCard
                        key={i}
                        tx={tx}
                        creditType={creditTypes[i]}
                        onCreditType={val => handleCreditType(i, val)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {result.summary.transaction_count === 0 && (
                <div className="text-center py-16 text-sm text-gray-400 dark:text-gray-500">
                  No transactions could be extracted from this PDF.
                  <br />
                  <span className="text-xs">Try a statement from Lloyds, Barclays, HSBC, Monzo, Starling or NatWest.</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Sticky bottom bar (shown after extraction) ─────────────────── */}
        {result && (
          <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {taggedCount} of {debits.length}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400"> spending transactions tagged</span>
              </div>

              {/* Mini progress bar */}
              {debits.length > 0 && (
                <div className="w-32 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                  <div
                    className="h-1.5 rounded-full bg-indigo-500 transition-all duration-300"
                    style={{ width: `${(taggedCount / debits.length) * 100}%` }}
                  />
                </div>
              )}

              {saveError && (
                <p className="text-xs text-rose-600 dark:text-rose-400">{saveError}</p>
              )}
            </div>

            {saved ? (
              <div className="flex items-center gap-2 px-5 py-2.5 bg-green-500 text-white text-sm font-semibold rounded-xl">
                {I.check} Saved! Redirecting…
              </div>
            ) : (
              <button
                onClick={handleSave}
                disabled={saving || taggedCount === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {saving ? <>{I.spin} Saving…</> : `Save ${taggedCount || ''} transaction${taggedCount === 1 ? '' : 's'} →`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
