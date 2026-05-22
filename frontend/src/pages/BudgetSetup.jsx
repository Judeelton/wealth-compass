import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Sidebar from '../components/Sidebar'

const API_BASE = 'http://127.0.0.1:8000'
const TOKEN_KEY = 'wc-token'

const SLIDERS = [
  {
    key: 'needs',
    label: 'Needs',
    hint: 'Rent, bills, food, transport',
    color: '#22c55e',
    dot: 'bg-green-500',
    text: 'text-green-600 dark:text-green-400',
  },
  {
    key: 'wants',
    label: 'Wants',
    hint: 'Eating out, entertainment, hobbies',
    color: '#f59e0b',
    dot: 'bg-amber-500',
    text: 'text-amber-600 dark:text-amber-400',
  },
  {
    key: 'savings',
    label: 'Savings',
    hint: 'Emergency fund, future goals',
    color: '#7c3aed',
    dot: 'bg-violet-700',
    text: 'text-violet-700 dark:text-violet-400',
  },
]

function getCurrentMonth() {
  return new Date().toISOString().slice(0, 7)
}

function extractDetail(detail) {
  if (!detail) return ''
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map(e => e.msg ?? JSON.stringify(e)).join('; ')
  return String(detail)
}

function formatAmount(income, pct) {
  const n = (income * pct) / 100
  if (n <= 0) return '—'
  return '£' + Math.round(n).toLocaleString('en-GB')
}

// ─── Small local icons ────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  )
}

// ─── Slider logic — keeps needs + wants + savings = 100 ──────────────────────

function adjustSplit(current, changedKey, rawVal) {
  const val = Math.min(100, Math.max(0, parseInt(rawVal) || 0))
  const keys = ['needs', 'wants', 'savings']
  const others = keys.filter(k => k !== changedKey)
  const remaining = 100 - val
  const otherTotal = others.reduce((s, k) => s + current[k], 0)

  let first, second
  if (otherTotal === 0) {
    first = Math.floor(remaining / 2)
    second = remaining - first
  } else {
    first = Math.round((current[others[0]] / otherTotal) * remaining)
    second = remaining - first
  }

  if (first < 0) { first = 0; second = remaining }
  if (second < 0) { second = 0; first = remaining }

  return { [changedKey]: val, [others[0]]: first, [others[1]]: second }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BudgetSetup() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [income, setIncome] = useState('')
  const [split, setSplit] = useState({ needs: 50, wants: 30, savings: 20 })
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')
  const [incomeError, setIncomeError] = useState('')

  const incomeNum = parseFloat(income) || 0

  function handleIncomeChange(e) {
    setIncome(e.target.value)
    if (incomeError) setIncomeError('')
    if (serverError) setServerError('')
  }

  function handleSlider(key, value) {
    setSplit(prev => adjustSplit(prev, key, value))
  }

  function blockNonNumeric(e) {
    const allowed = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'Enter']
    if (allowed.includes(e.key) || /^\d$/.test(e.key)) return
    e.preventDefault()
  }

  async function handleContinue() {
    const parsed = parseFloat(income.replace(/[^0-9.]/g, ''))
    if (!income || isNaN(parsed) || parsed <= 0) {
      setIncomeError('Please enter a valid monthly income greater than £0')
      return
    }
    setIncomeError('')
    setServerError('')
    setLoading(true)

    const token = localStorage.getItem(TOKEN_KEY)
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    }
    const payload = {
      income: Math.round(parsed),
      needs_pct: Math.round(split.needs),
      wants_pct: Math.round(split.wants),
      savings_pct: Math.round(split.savings),
      month: getCurrentMonth(),
    }

    try {
      const res = await fetch(`${API_BASE}/api/budget`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        navigate('/envelope-setup')
        return
      }

      const data = await res.json().catch(() => ({}))
      const detail = extractDetail(data.detail)

      if (res.status === 400 && detail.toLowerCase().includes('already exists')) {
        const getRes = await fetch(`${API_BASE}/api/budget`, { headers })
        if (!getRes.ok) throw new Error('Could not retrieve your existing budget.')
        const existing = await getRes.json()

        const budgetId = Array.isArray(existing) ? existing[0]?.id : existing.id
        if (!budgetId) throw new Error('Could not determine budget ID to update.')

        const putRes = await fetch(`${API_BASE}/api/budget/${budgetId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(payload),
        })

        if (putRes.ok) {
          navigate('/envelope-setup')
          return
        }

        const putData = await putRes.json().catch(() => ({}))
        throw new Error(extractDetail(putData.detail) || 'Could not update your budget. Please try again.')
      }

      throw new Error(detail || 'Could not save your budget. Please try again.')
    } catch (err) {
      setServerError(err.message || err.detail || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex overflow-hidden" style={{ height: '100vh' }}>
      <style>{`
        input[type='range'] {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 6px;
          border-radius: 3px;
          outline: none;
          cursor: pointer;
        }
        input[type='range'].needs-slider   { background: #1D9E75; }
        input[type='range'].wants-slider   { background: #EF9F27; }
        input[type='range'].savings-slider { background: #7F77DD; }
        input[type='range']::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          cursor: pointer;
        }
        input[type='range'].needs-slider::-webkit-slider-thumb   { background: #1D9E75; }
        input[type='range'].wants-slider::-webkit-slider-thumb   { background: #EF9F27; }
        input[type='range'].savings-slider::-webkit-slider-thumb { background: #7F77DD; }
      `}</style>
      <Sidebar user={user} />

      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
        <div className="px-6 py-8">

          {/* ── Step indicator ───────────────────────────────────────────────── */}
          <div className="flex items-center gap-2 mb-8">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                <CheckIcon />
              </div>
              <span className="text-xs font-medium text-gray-400 dark:text-gray-500 hidden sm:block">Assessment</span>
            </div>
            <div className="flex-1 h-px bg-indigo-200 dark:bg-indigo-900" style={{ maxWidth: '3rem' }} />
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold leading-none">2</span>
              </div>
              <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hidden sm:block">Budget Setup</span>
            </div>
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" style={{ maxWidth: '3rem' }} />
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center flex-shrink-0">
                <span className="text-gray-400 dark:text-gray-500 text-xs font-bold leading-none">3</span>
              </div>
              <span className="text-xs font-medium text-gray-400 dark:text-gray-500 hidden sm:block">Dashboard</span>
            </div>
          </div>

          {/* ── Page heading ─────────────────────────────────────────────────── */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Set up your budget</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Tell us your income and how you'd like to split it. You can always change this later.
            </p>
          </div>

          {/* ── 3-column responsive grid ─────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start mb-6">

          {/* ── Section 1: Income ────────────────────────────────────────────── */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-0.5">
              What is your monthly income?
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Enter your take-home pay after tax
            </p>

            <div className="relative">
              <span className="absolute inset-y-0 left-4 flex items-center text-lg font-semibold text-gray-500 dark:text-gray-400 pointer-events-none select-none">
                £
              </span>
              <input
                type="number"
                min="0"
                step="1"
                value={income}
                onChange={handleIncomeChange}
                onKeyDown={blockNonNumeric}
                placeholder="1200"
                aria-label="Monthly income"
                className={`w-full pl-9 pr-4 py-3.5 text-xl font-semibold border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-2 transition-colors ${
                  incomeError
                    ? 'border-red-400 dark:border-red-500 focus:ring-red-400'
                    : 'border-gray-200 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500'
                }`}
              />
            </div>

            {incomeError && (
              <p className="flex items-center gap-1.5 mt-2 text-xs text-red-500 dark:text-red-400">
                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {incomeError}
              </p>
            )}
          </div>

          {/* ── Section 2: Split sliders ─────────────────────────────────────── */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-0.5">
              How do you want to split your budget?
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
              We suggest the <span className="font-semibold">50/30/20 rule</span> as a starting point — adjust to fit your life
            </p>

            <div className="space-y-6">
              {SLIDERS.map(({ key, label, hint, color, dot, text }) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full flex-shrink-0 ${dot}`} />
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{label}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={split[key]}
                        onChange={e => handleSlider(key, e.target.value)}
                        onKeyDown={blockNonNumeric}
                        aria-label={`${label} percentage`}
                        className={`text-lg font-bold text-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${text}`}
                        style={{ width: '52px' }}
                      />
                      <span className={`text-lg font-bold ${text}`}>%</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                        = £{Math.round(incomeNum * split[key] / 100)}/month
                      </span>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={split[key]}
                    onChange={e => handleSlider(key, e.target.value)}
                    aria-label={`${label} percentage`}
                    className={`w-full ${key}-slider`}
                  />

                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">{hint}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
              <span className="text-xs text-gray-500 dark:text-gray-400">Total allocated</span>
              <span className="text-sm font-bold text-gray-900 dark:text-white">
                {split.needs + split.wants + split.savings}%
              </span>
            </div>
          </div>

          {/* ── Section 3: Visual summary bar ────────────────────────────────── */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 md:col-span-2 lg:col-span-1">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
              Your budget at a glance
            </h2>

            <div className="flex rounded-lg overflow-hidden h-9 mb-4">
              <div
                className="bg-green-500 transition-all duration-200 flex items-center justify-center"
                style={{ width: `${split.needs}%` }}
              >
                {split.needs >= 12 && (
                  <span className="text-white text-xs font-bold">{split.needs}%</span>
                )}
              </div>
              <div
                className="bg-amber-500 transition-all duration-200 flex items-center justify-center"
                style={{ width: `${split.wants}%` }}
              >
                {split.wants >= 12 && (
                  <span className="text-white text-xs font-bold">{split.wants}%</span>
                )}
              </div>
              <div
                className="bg-violet-700 transition-all duration-200 flex items-center justify-center"
                style={{ width: `${split.savings}%` }}
              >
                {split.savings >= 12 && (
                  <span className="text-white text-xs font-bold">{split.savings}%</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {SLIDERS.map(({ key, label, dot }) => (
                <div key={key} className="text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-0.5">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot}`} />
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
                  </div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                    {formatAmount(incomeNum, split[key])}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{split[key]}%</p>
                </div>
              ))}
            </div>
          </div>

          </div>{/* end grid */}

          {/* ── Server error + button (centered below grid) ───────────────────── */}
          <div className="max-w-lg mx-auto">
            {serverError && (
              <div className="mb-4 flex items-start gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="#ef4444" style={{ flexShrink: 0, marginTop: '2px' }}>
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <p className="text-sm text-red-600 dark:text-red-400">{serverError}</p>
              </div>
            )}

            <button
              onClick={handleContinue}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3.5 rounded-lg font-semibold hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <><Spinner />Saving your budget…</>
              ) : (
                'Continue to envelope setup →'
              )}
            </button>

            <p className="text-center text-xs text-gray-400 dark:text-gray-600 mt-4 pb-8">
              You can update your budget at any time from your dashboard
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}
