import { useState, useEffect } from 'react'
import { useNavigate, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  PieChart, Pie, Legend,
} from 'recharts'
import Sidebar from '../components/Sidebar'

const API_BASE  = 'http://127.0.0.1:8000'
const TOKEN_KEY = 'wc-token'

const CAT_COLORS  = ['#6366f1','#8b5cf6','#ec4899','#f43f5e','#f97316','#eab308','#22c55e']
const SPLIT_COLORS = { need: '#22c55e', want: '#f59e0b', saving: '#7c3aed' }

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Format pound amounts for display — rounds to whole numbers, no pence clutter
function fmt(n) {
  return '£' + Math.round(Math.abs(n)).toLocaleString('en-GB')
}

// Cap at 100 so the progress bar never overflows when someone goes over budget
function pct(spent, budget) {
  if (!budget) return 0
  return Math.min(100, Math.round((spent / budget) * 100))
}

// Time-based greeting for the dashboard header
function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function todayLabel() {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

// Maps a FAS score to display config — thresholds come from Archuleta et al. 2013 (≤14 low, ≤24 moderate)
function fasConfig(score) {
  if (score == null) return { label: '—', color: 'text-gray-400 dark:text-gray-500', dot: 'bg-gray-300' }
  if (score <= 14) return { label: 'Low anxiety',      color: 'text-green-700 dark:text-green-400', dot: 'bg-green-500' }
  if (score <= 24) return { label: 'Moderate anxiety', color: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' }
  return              { label: 'High anxiety',       color: 'text-rose-700 dark:text-rose-400',   dot: 'bg-rose-500'  }
}

// Colour coding per insight type — matches the backend's insight_type enum
const INSIGHT_TYPE = {
  spending:  { dot: 'bg-indigo-500', text: 'text-indigo-600 dark:text-indigo-400' },
  savings:   { dot: 'bg-green-500',  text: 'text-green-600 dark:text-green-400'   },
  behaviour: { dot: 'bg-amber-500',  text: 'text-amber-600 dark:text-amber-400'   },
}

// ─── Icons (local — only what's used outside the Sidebar) ────────────────────

const I = {
  wallet: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/>
      <circle cx="18" cy="14" r="1" fill="currentColor"/>
    </svg>
  ),
  upload: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  ),
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="flex justify-between items-start">
        <div className="space-y-2">
          <div className="h-7 w-52 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          <div className="h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
        <div className="h-9 w-36 bg-gray-200 dark:bg-gray-700 rounded-lg" />
      </div>
      <div className="grid grid-cols-5 gap-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="h-72 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        <div className="h-72 bg-gray-200 dark:bg-gray-700 rounded-xl" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-xl" />
      </div>
    </div>
  )
}

// ─── No-budget empty state ────────────────────────────────────────────────────

function NoBudget({ navigate }) {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: '80vh' }}>
      <div className="text-center max-w-xs px-6">
        <div className="w-14 h-14 bg-indigo-100 dark:bg-indigo-900 dark:bg-opacity-40 rounded-2xl flex items-center justify-center mx-auto mb-4 text-indigo-600 dark:text-indigo-400">
          {I.wallet}
        </div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Set up your budget first</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-5">
          Complete your budget setup to unlock your dashboard, spending charts, and personalised insights.
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

// ─── Card wrapper ─────────────────────────────────────────────────────────────

function Card({ title, children, action }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col">
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
        {action && <span className="text-xs text-gray-400 dark:text-gray-500">{action}</span>}
      </div>
      <div className="flex-1 px-5 py-4">{children}</div>
    </div>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────

// The little coloured bar turns red if barPct hits 100 — useful visual warning when over budget
function StatCard({ label, value, sub, barPct, barColor }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col justify-between" style={{ minHeight: 100, maxHeight: 120 }}>
      <div>
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 leading-tight">{label}</p>
        <p className="text-xl font-bold text-gray-900 dark:text-white leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-tight truncate">{sub}</p>}
      </div>
      {barPct != null && (
        <div className="mt-2 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
          <div
            className="h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${barPct}%`, backgroundColor: barColor ?? '#6366f1' }}
          />
        </div>
      )}
    </div>
  )
}

// ─── Spending bar chart ───────────────────────────────────────────────────────

// layout="vertical" on a BarChart gives horizontal bars — a bit counterintuitive but that's recharts
function SpendingChart({ data, isDark }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-52 text-sm text-gray-400 dark:text-gray-500">
        No transactions yet
      </div>
    )
  }
  const tick = { fontSize: 11, fill: isDark ? '#9ca3af' : '#6b7280' }
  const tooltipStyle = {
    background: isDark ? '#1f2937' : '#fff',
    border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
    borderRadius: 8,
    fontSize: 12,
    color: isDark ? '#f3f4f6' : '#111827',
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 28, top: 4, bottom: 4 }}>
        <XAxis type="number" tick={tick} axisLine={false} tickLine={false} tickFormatter={v => `£${v}`} />
        <YAxis type="category" dataKey="name" tick={tick} axisLine={false} tickLine={false} width={86} />
        <Tooltip
          cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}
          contentStyle={tooltipStyle}
          formatter={v => [`£${v.toLocaleString('en-GB')}`, 'Spent']}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18}>
          {data.map((_, i) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── Donut chart ──────────────────────────────────────────────────────────────

// Shows the needs/wants/savings breakdown — makes it immediately obvious if the split is off
function DonutChart({ donutData, isDark }) {
  if (donutData.length === 0) {
    return (
      <div className="flex items-center justify-center h-52 text-sm text-gray-400 dark:text-gray-500">
        No expense data yet
      </div>
    )
  }
  const tooltipStyle = {
    background: isDark ? '#1f2937' : '#fff',
    border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
    borderRadius: 8,
    fontSize: 12,
    color: isDark ? '#f3f4f6' : '#111827',
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={donutData}
          cx="50%"
          cy="45%"
          innerRadius={58}
          outerRadius={88}
          paddingAngle={3}
          dataKey="value"
        >
          {donutData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
        </Pie>
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v, name) => [`£${Math.round(v).toLocaleString('en-GB')}`, name]}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={value => (
            <span style={{ fontSize: 11, color: isDark ? '#9ca3af' : '#6b7280' }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

// ─── Transaction row ──────────────────────────────────────────────────────────

function TxRow({ expense }) {
  const badge = {
    need:   'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900 dark:bg-opacity-40',
    want:   'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900 dark:bg-opacity-40',
    saving: 'text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-900 dark:bg-opacity-40',
  }
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-50 dark:border-gray-700 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{expense.title}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{expense.category}</p>
      </div>
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${badge[expense.need_or_want] ?? 'text-gray-500 bg-gray-100 dark:bg-gray-700'}`}>
        {expense.need_or_want}
      </span>
      <span className="text-sm font-bold text-gray-900 dark:text-white flex-shrink-0 ml-1">
        {fmt(expense.amount)}
      </span>
    </div>
  )
}

// ─── Dashboard page ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const isDark = theme === 'dark'

  const [loading,    setLoading]    = useState(true)
  const [loadError,  setLoadError]  = useState(null)
  const [budget,     setBudget]     = useState(null)
  const [expenses,   setExpenses]   = useState([])
  const [assessment, setAssessment] = useState(null)
  const [insights,   setInsights]   = useState([])
  const [envelopes,  setEnvelopes]  = useState([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      const token = localStorage.getItem(TOKEN_KEY)
      const h = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }

      try {
        // Budget is the only fatal one — if it fails, the whole dashboard is broken
        const budgetRes = await fetch(`${API_BASE}/api/budget`, { headers: h })
        if (!budgetRes.ok) throw new Error('Could not load your budget. Please try again.')

        const budgets = await budgetRes.json()
        if (cancelled) return

        const currentBudget = budgets[0] ?? null
        setBudget(currentBudget)

        // Assessment and insights are optional — new users won't have these yet so I catch rather than throw
        const [assessRes, insightRes, envRes] = await Promise.all([
          fetch(`${API_BASE}/api/assessment`, { headers: h }).catch(() => null),
          fetch(`${API_BASE}/api/insights`,   { headers: h }).catch(() => null),
          fetch(`${API_BASE}/api/envelopes`,  { headers: h }).catch(() => null),
        ])

        if (!cancelled) {
          if (assessRes?.ok) {
            const assessments = await assessRes.json().catch(() => [])
            setAssessment(assessments[0] ?? null)
          }
          if (insightRes?.ok) {
            const insightsList = await insightRes.json().catch(() => [])
            setInsights(insightsList.slice(0, 3))
          }
          if (envRes?.ok) {
            const envData = await envRes.json().catch(() => [])
            setEnvelopes(Array.isArray(envData) ? envData : [])
          }
        }

        // Only fetch expenses once I have a budget ID to filter by
        if (currentBudget && !cancelled) {
          const expRes = await fetch(
            `${API_BASE}/api/expenses?budget_id=${currentBudget.id}`,
            { headers: h }
          ).catch(() => null)
          if (expRes?.ok && !cancelled) {
            const data = await expRes.json().catch(() => [])
            setExpenses(Array.isArray(data) ? data : [])
          }
        }
      } catch (err) {
        if (!cancelled) setLoadError(err.message || 'Something went wrong loading your dashboard.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  // ── Derived values ──────────────────────────────────────────────────────────
  const income       = budget?.income ?? 0
  // Convert the percentage split into actual pound targets
  const needsBudget  = income * (budget?.needs_pct   ?? 50) / 100
  const wantsBudget  = income * (budget?.wants_pct   ?? 30) / 100
  const savingsBudget= income * (budget?.savings_pct ?? 20) / 100

  // Only show expenses from current month so dashboard reflects the current budget period
  const currentMonth = new Date().toISOString().slice(0, 7) // e.g. "2026-05"
  const currentMonthExpenses = expenses.filter(exp => {
    if (!exp.created_at) return false
    return exp.created_at.startsWith(currentMonth)
  })

  const totalSpent  = currentMonthExpenses.reduce((s, e) => s + e.amount, 0)
  const needsSpent  = currentMonthExpenses.filter(e => e.need_or_want === 'need').reduce((s, e) => s + e.amount, 0)
  const wantsSpent  = currentMonthExpenses.filter(e => e.need_or_want === 'want').reduce((s, e) => s + e.amount, 0)
  const savingsSpent= currentMonthExpenses.filter(e => e.need_or_want === 'saving').reduce((s, e) => s + e.amount, 0)

  // Aggregate spending by category for the horizontal bar chart — top 7 only
  const categoryData = Object.entries(
    currentMonthExpenses.reduce((acc, e) => ({ ...acc, [e.category]: (acc[e.category] ?? 0) + e.amount }), {})
  ).map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 7)

  // Filter out zero-value buckets so the donut doesn't show empty segments
  const donutData = [
    { name: 'Needs',   value: needsSpent,   color: SPLIT_COLORS.need    },
    { name: 'Wants',   value: wantsSpent,   color: SPLIT_COLORS.want    },
    { name: 'Savings', value: savingsSpent, color: SPLIT_COLORS.saving  },
  ].filter(d => d.value > 0)

  // Per-envelope actual vs planned — only envelopes with a budget allocation are shown
  const envelopeHealth = envelopes
    .filter(env => env.allocated_amount > 0)
    .map(env => ({
      id: env.id,
      name: env.name,
      allocated: env.allocated_amount,
      spent: currentMonthExpenses.filter(e => e.envelope === env.name).reduce((s, e) => s + e.amount, 0),
    }))
    .slice(0, 6)

  const fas = fasConfig(assessment?.stress_score)
  const recentTx = currentMonthExpenses.slice(0, 8)

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex overflow-hidden" style={{ height: '100vh' }}>
      <Sidebar user={user} />

      {/* Main scrollable area */}
      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
        {loading ? (
          <Skeleton />
        ) : loadError ? (
          <div className="flex items-center justify-center h-screen text-sm text-red-500">{loadError}</div>
        ) : !budget ? (
          <NoBudget navigate={navigate} />
        ) : (
          <div className="p-6 space-y-4">

            {/* ── Topbar ──────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">
                  {greeting()}{user?.name ? `, ${user.name.split(' ')[0]}` : ''} 👋
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{todayLabel()}</p>
              </div>
              <NavLink
                to="/upload"
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {I.upload}
                Upload statement
              </NavLink>
            </div>

            {/* ── Stat cards — 5 in one row ─────────────────────────────── */}
            <div className="grid grid-cols-5 gap-3">
              <StatCard
                label="Monthly Income"
                value={fmt(income)}
                sub={`Budget: ${budget.month}`}
              />
              <StatCard
                label="Total Spent"
                value={fmt(totalSpent)}
                sub={income > 0 ? `${pct(totalSpent, income)}% of income` : '—'}
                barPct={pct(totalSpent, income)}
                barColor={totalSpent > income ? '#ef4444' : '#6366f1'}
              />
              <StatCard
                label="Needs"
                value={fmt(needsSpent)}
                sub={`of ${fmt(needsBudget)} budgeted`}
                barPct={pct(needsSpent, needsBudget)}
                barColor={needsSpent > needsBudget ? '#ef4444' : SPLIT_COLORS.need}
              />
              <StatCard
                label="Wants"
                value={fmt(wantsSpent)}
                sub={`of ${fmt(wantsBudget)} budgeted`}
                barPct={pct(wantsSpent, wantsBudget)}
                barColor={wantsSpent > wantsBudget ? '#ef4444' : SPLIT_COLORS.want}
              />
              <StatCard
                label="Savings Goal"
                value={fmt(savingsBudget)}
                sub={savingsSpent > 0 ? `${fmt(savingsSpent)} saved so far` : 'Set aside this month'}
                barPct={pct(savingsSpent, savingsBudget)}
                barColor={SPLIT_COLORS.saving}
              />
            </div>

            {/* ── Charts row ────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">
              <Card title="Spending by Category" action={`${expenses.length} transactions`}>
                <SpendingChart data={categoryData} isDark={isDark} />
              </Card>

              <Card title="Needs vs Wants vs Savings">
                <DonutChart donutData={donutData} isDark={isDark} />
              </Card>
            </div>

            {/* ── Bottom row ────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">

              {/* Recent transactions */}
              <Card title="Recent Transactions" action={recentTx.length > 0 ? `${expenses.length} total` : undefined}>
                {recentTx.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">
                    No transactions yet
                  </p>
                ) : (
                  <div>
                    {recentTx.map(e => <TxRow key={e.id} expense={e} />)}
                  </div>
                )}
              </Card>

              {/* FAS score + insights */}
              <Card title="Financial Wellbeing">
                {/* Score block */}
                <div className="flex items-center gap-4 pb-4 mb-4 border-b border-gray-100 dark:border-gray-700">
                  <div className="flex-shrink-0 text-center">
                    <p className="text-3xl font-bold text-gray-900 dark:text-white leading-none">
                      {assessment?.stress_score ?? '—'}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">out of 35</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${fas.dot}`} />
                      <span className={`text-xs font-semibold ${fas.color}`}>{fas.label}</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                      Financial Anxiety Scale (FAS) — Archuleta et al. 2013
                    </p>
                    {!assessment && (
                      <button
                        onClick={() => navigate('/assessment')}
                        className="mt-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        Take the assessment →
                      </button>
                    )}
                  </div>
                  {/* Mini score bar — scaled to [7, 35] since that's the valid FAS range, not [0, 35] */}
                  {assessment && (
                    <div className="flex-1 min-w-0">
                      <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                        <div
                          className="h-2 rounded-full transition-all duration-700"
                          style={{
                            width: `${((assessment.stress_score - 7) / 28) * 100}%`,
                            backgroundColor: assessment.stress_score <= 14 ? '#22c55e' : assessment.stress_score <= 24 ? '#f59e0b' : '#f43f5e',
                          }}
                        />
                      </div>
                      <div className="flex justify-between mt-0.5">
                        <span className="text-xs text-gray-400 dark:text-gray-600">7</span>
                        <span className="text-xs text-gray-400 dark:text-gray-600">35</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Insights */}
                {insights.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500 py-2 text-center">
                    No insights generated yet
                  </p>
                ) : (
                  <div className="space-y-3">
                    {insights.map(ins => {
                      const cfg = INSIGHT_TYPE[ins.insight_type] ?? INSIGHT_TYPE.spending
                      return (
                        <div key={ins.id} className="flex gap-2.5">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${cfg.dot}`} />
                          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                            {ins.message}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Envelope health — shows planned vs actual per envelope */}
                {envelopeHealth.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Envelope Health</p>
                    <div className="space-y-2.5">
                      {envelopeHealth.map(env => {
                        const isOver = env.spent > env.allocated
                        const barPct = env.allocated > 0 ? Math.min(100, (env.spent / env.allocated) * 100) : 0
                        return (
                          <div key={env.id}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-gray-700 dark:text-gray-300 truncate max-w-[120px]">{env.name}</span>
                              <span className={`text-xs font-semibold flex-shrink-0 ${isOver ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                {fmt(env.spent)} / {fmt(env.allocated)}
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                              <div
                                className="h-1.5 rounded-full transition-all duration-500"
                                style={{ width: `${barPct}%`, backgroundColor: isOver ? '#ef4444' : '#22c55e' }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </Card>

            </div>
          </div>
        )}
      </div>
    </div>
  )
}
