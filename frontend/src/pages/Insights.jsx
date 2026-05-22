import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts'
import Sidebar from '../components/Sidebar'

const API_BASE  = 'http://127.0.0.1:8000'
const TOKEN_KEY = 'wc-token'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n) {
  return '£' + Math.round(Math.abs(n)).toLocaleString('en-GB')
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fasConfig(score) {
  if (score == null) return { label: '—', color: 'text-gray-400 dark:text-gray-500', dot: 'bg-gray-300', line: '#9ca3af' }
  if (score <= 14)   return { label: 'Low anxiety',      color: 'text-green-700 dark:text-green-400', dot: 'bg-green-500',  line: '#22c55e' }
  if (score <= 24)   return { label: 'Moderate anxiety', color: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500',  line: '#f59e0b' }
  return                    { label: 'High anxiety',     color: 'text-rose-700 dark:text-rose-400',   dot: 'bg-rose-500',   line: '#f43f5e' }
}

// Per-type visual config — all class names spelled out statically so Tailwind doesn't purge them
const INSIGHT_STYLE = {
  spending: {
    border: 'border-l-amber-500',
    iconBg: 'bg-amber-100 dark:bg-amber-900/40',
    iconColor: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  },
  savings: {
    border: 'border-l-green-500',
    iconBg: 'bg-green-100 dark:bg-green-900/40',
    iconColor: 'text-green-600 dark:text-green-400',
    badge: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  },
  behaviour: {
    border: 'border-l-violet-500',
    iconBg: 'bg-violet-100 dark:bg-violet-900/40',
    iconColor: 'text-violet-600 dark:text-violet-400',
    badge: 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300',
  },
}
const INSIGHT_STYLE_DEFAULT = INSIGHT_STYLE.spending

// ── Icons ─────────────────────────────────────────────────────────────────────

const I = {
  trending: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
      <polyline points="17 6 23 6 23 12"/>
    </svg>
  ),
  card: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  ),
  activity: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  ),
  upload: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  ),
  check: (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
    </svg>
  ),
  download: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  ),
  spinner: (
    <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  ),
  warning: (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
    </svg>
  ),
  close: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
}

const INSIGHT_ICONS = {
  spending:  I.card,
  savings:   I.trending,
  behaviour: I.activity,
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, subtitle, children }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
      <div className="px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-700">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="w-full px-6 py-8 space-y-6 animate-pulse">
      {[200, 280, 220, 240].map((h, i) => (
        <div key={i} className="bg-gray-200 dark:bg-gray-700 rounded-xl" style={{ height: h }} />
      ))}
    </div>
  )
}

// ── Custom Recharts tooltip ───────────────────────────────────────────────────

function ScoreTooltip({ active, payload, isDark }) {
  if (!active || !payload?.length) return null
  const score = payload[0].value
  const cfg   = fasConfig(score)
  return (
    <div
      className="px-3 py-2 rounded-lg shadow text-xs"
      style={{
        background: isDark ? '#1f2937' : '#fff',
        border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
        color: isDark ? '#f3f4f6' : '#111827',
      }}
    >
      <p className="font-semibold">{score} / 35</p>
      <p className={cfg.color}>{cfg.label}</p>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Insights() {
  const { user }  = useAuth()
  const { theme } = useTheme()
  const navigate  = useNavigate()
  const isDark    = theme === 'dark'

  const [loading,           setLoading]           = useState(true)
  const [error,             setError]             = useState('')
  const [budget,            setBudget]            = useState(null)
  const [assessments,       setAssessments]       = useState([])   // newest first
  const [insights,          setInsights]          = useState([])
  const [insightsGenerating,setInsightsGenerating]= useState(false)
  const [expenses,          setExpenses]          = useState([])
  const [reflections,       setReflections]       = useState({})   // { [id]: 'necessary' | 'reduce' }
  const [reportLoading,     setReportLoading]     = useState(null)
  const [reportError,       setReportError]       = useState('')
  const [showReportModal,   setShowReportModal]   = useState(false)
  const [modalReportType,   setModalReportType]   = useState('monthly')
  const [reportStartDate,   setReportStartDate]   = useState(() => {
    const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]
  })
  const [reportEndDate,     setReportEndDate]     = useState(() => new Date().toISOString().split('T')[0])

  // ── Data fetch ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function load() {
      const token = localStorage.getItem(TOKEN_KEY)
      const h = { Authorization: `Bearer ${token}` }

      try {
        const [budgetRes, assessRes, insightRes] = await Promise.all([
          fetch(`${API_BASE}/api/budget`,     { headers: h }),
          fetch(`${API_BASE}/api/assessment`, { headers: h }),
          fetch(`${API_BASE}/api/insights`,   { headers: h }),
        ])

        if (cancelled) return

        const budgets = budgetRes.ok ? await budgetRes.json().catch(() => []) : []
        const currentBudget = Array.isArray(budgets) ? (budgets[0] ?? null) : null
        setBudget(currentBudget)

        if (assessRes.ok) setAssessments(await assessRes.json().catch(() => []))

        const fetchedInsights = insightRes.ok ? await insightRes.json().catch(() => []) : []
        setInsights(fetchedInsights)

        let fetchedExpenses = []
        if (currentBudget && !cancelled) {
          const expRes = await fetch(
            `${API_BASE}/api/expenses?budget_id=${currentBudget.id}`,
            { headers: h }
          ).catch(() => null)
          if (expRes?.ok && !cancelled) {
            const data = await expRes.json().catch(() => [])
            fetchedExpenses = Array.isArray(data) ? data : []
            setExpenses(fetchedExpenses)
          }
        }

        // Auto-generate insights when expenses exist but none have been generated yet
        if (fetchedExpenses.length > 0 && fetchedInsights.length === 0 && currentBudget && !cancelled) {
          setInsightsGenerating(true)
          try {
            const genRes = await fetch(`${API_BASE}/api/insights/generate`, {
              method: 'POST',
              headers: { ...h, 'Content-Type': 'application/json' },
              body: JSON.stringify({ month: currentBudget.month, envelope_allocations: {} }),
            })
            if (genRes.ok && !cancelled) {
              const generated = await genRes.json().catch(() => [])
              setInsights(Array.isArray(generated) ? generated : [])
            }
          } catch {
            // silently fail — insights section will show empty state
          } finally {
            if (!cancelled) setInsightsGenerating(false)
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load insights')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  // ── Derived values ─────────────────────────────────────────────────────────
  const income        = budget?.income ?? 0
  const needsBudget   = income * (budget?.needs_pct   ?? 50) / 100
  const wantsBudget   = income * (budget?.wants_pct   ?? 30) / 100
  const savingsBudget = income * (budget?.savings_pct ?? 20) / 100

  const needsSpent   = expenses.filter(e => e.need_or_want === 'need').reduce((s, e) => s + e.amount, 0)
  const wantsSpent   = expenses.filter(e => e.need_or_want === 'want').reduce((s, e) => s + e.amount, 0)
  const savingsSpent = expenses.filter(e => e.need_or_want === 'saving').reduce((s, e) => s + e.amount, 0)

  const wantExpenses    = expenses.filter(e => e.need_or_want === 'want')
  const savingsEnvelope = expenses.find(e => e.need_or_want === 'saving' && e.envelope)?.envelope ?? 'savings goal'

  // Chart data: oldest → newest for chronological left-to-right display
  const chartData = [...assessments].reverse().map(a => ({
    date:  new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    score: a.stress_score,
  }))

  const latestAssessment = assessments[0] ?? null
  const fas = fasConfig(latestAssessment?.stress_score)

  const buckets = [
    { name: 'Needs',   spent: needsSpent,   budget: needsBudget,   color: '#1D9E75', key: 'need'   },
    { name: 'Wants',   spent: wantsSpent,   budget: wantsBudget,   color: '#EF9F27', key: 'want'   },
    { name: 'Savings', spent: savingsSpent, budget: savingsBudget, color: '#7F77DD', key: 'saving' },
  ]

  const overspending = buckets
    .filter(b => b.budget > 0 && b.spent > b.budget)
    .sort((a, b) => (b.spent - b.budget) - (a.spent - a.budget))
    .slice(0, 3)

  const positive = buckets
    .filter(b => b.budget > 0 && b.spent <= b.budget)
    .sort((a, b) => (b.budget - b.spent) - (a.budget - a.spent))
    .slice(0, 1)

  // Top category within a bucket
  function topCat(bucketKey) {
    const cats = expenses
      .filter(e => e.need_or_want === bucketKey)
      .reduce((acc, e) => ({ ...acc, [e.category]: (acc[e.category] ?? 0) + e.amount }), {})
    const entries = Object.entries(cats).sort((a, b) => b[1] - a[1])
    return entries[0] ? { name: entries[0][0], amount: entries[0][1] } : null
  }

  // ── Report download ────────────────────────────────────────────────────────
  async function downloadReport(reportType, startDate, endDate) {
    setReportLoading(reportType)
    setReportError('')
    try {
      const token = localStorage.getItem(TOKEN_KEY)
      const res = await fetch(`${API_BASE}/api/reports/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          report_type: reportType,
          start_date: startDate || null,
          end_date: endDate || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Failed to generate report')
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `wealth-compass-${reportType}-report.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setShowReportModal(false)
    } catch (err) {
      setReportError(err.message || 'Could not generate report. Please try again.')
    } finally {
      setReportLoading(null)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const tickStyle = { fontSize: 11, fill: isDark ? '#9ca3af' : '#6b7280' }
  const tooltipContainerStyle = {
    background: isDark ? '#1f2937' : '#fff',
    border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
    borderRadius: 8,
    fontSize: 12,
    color: isDark ? '#f3f4f6' : '#111827',
  }

  return (
    <div className="flex overflow-hidden" style={{ height: '100vh' }}>
      <Sidebar user={user} />

      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
        {loading ? (
          <Skeleton />
        ) : error ? (
          <div className="flex items-center justify-center h-screen text-sm text-red-500">{error}</div>
        ) : (
          <div className="w-full px-6 py-8 space-y-6">

            {/* ── Page heading ──────────────────────────────────────────────── */}
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Insights</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Your financial wellbeing, patterns, and personalised recommendations
              </p>
            </div>

            {/* ── SECTION 1: FAS Score Card ──────────────────────────────────── */}
            <Section
              title="Financial Anxiety Score"
              subtitle="Financial Anxiety Scale — Archuleta et al. 2013"
            >
              {/* Score + level */}
              <div className="flex items-start gap-6 mb-6">
                <div className="text-center flex-shrink-0">
                  <p className="text-5xl font-bold text-gray-900 dark:text-white leading-none">
                    {latestAssessment?.stress_score ?? '—'}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">out of 35</p>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${fas.dot}`} />
                    <span className={`text-sm font-semibold ${fas.color}`}>{fas.label}</span>
                  </div>
                  {latestAssessment && (
                    <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden mb-1">
                      <div
                        className="h-2 rounded-full transition-all duration-700"
                        style={{
                          width: `${((latestAssessment.stress_score - 7) / 28) * 100}%`,
                          backgroundColor: fas.line,
                        }}
                      />
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-400 dark:text-gray-600">7 (min)</span>
                    <span className="text-xs text-gray-400 dark:text-gray-600">35 (max)</span>
                  </div>
                  {latestAssessment && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                      Last taken {fmtDate(latestAssessment.created_at)}
                    </p>
                  )}
                </div>
              </div>

              {/* History chart */}
              {chartData.length >= 2 ? (
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">Score history</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={chartData} margin={{ left: 0, right: 12, top: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#374151' : '#f3f4f6'} />
                      <XAxis dataKey="date" tick={tickStyle} axisLine={false} tickLine={false} />
                      <YAxis domain={[7, 35]} tick={tickStyle} axisLine={false} tickLine={false} width={28} />
                      <Tooltip content={<ScoreTooltip isDark={isDark} />} />
                      <ReferenceLine y={14} stroke="#22c55e" strokeDasharray="4 2" strokeOpacity={0.5} />
                      <ReferenceLine y={24} stroke="#f59e0b" strokeDasharray="4 2" strokeOpacity={0.5} />
                      <Line
                        type="monotone" dataKey="score"
                        stroke="#6366f1" strokeWidth={2.5}
                        dot={{ r: 5, fill: '#6366f1', strokeWidth: 2, stroke: isDark ? '#1f2937' : '#fff' }}
                        activeDot={{ r: 7 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <p className="text-xs text-gray-400 dark:text-gray-600 mt-1.5">
                    Dashed lines: green = low threshold (14), amber = moderate threshold (24)
                  </p>
                </div>
              ) : chartData.length === 1 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                  Take the assessment again to see your score trend over time
                </p>
              ) : null}

              <button
                onClick={() => navigate('/assessment')}
                className="mt-5 px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
              >
                Retake Assessment →
              </button>
            </Section>

            {/* ── SECTION 2: Personalised Insights ──────────────────────────── */}
            <Section
              title="Your Personalised Insights"
              subtitle="Generated from your spending data and FAS score"
            >
              {expenses.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Upload a statement to generate personalised insights
                  </p>
                  <button
                    onClick={() => navigate('/upload')}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {I.upload}
                    Upload a statement
                  </button>
                </div>
              ) : insightsGenerating ? (
                <div className="flex items-center justify-center gap-3 py-8 text-sm text-gray-500 dark:text-gray-400">
                  {I.spinner}
                  Generating insights…
                </div>
              ) : insights.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
                  No insights generated yet. Try re-uploading a statement.
                </p>
              ) : (
                <div className="space-y-3">
                  {insights.map(ins => {
                    const s = INSIGHT_STYLE[ins.insight_type] ?? INSIGHT_STYLE_DEFAULT
                    const icon = INSIGHT_ICONS[ins.insight_type] ?? I.activity
                    return (
                      <div
                        key={ins.id}
                        className={`flex gap-3 p-4 rounded-lg border border-gray-100 dark:border-gray-700 border-l-4 ${s.border}`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${s.iconBg} ${s.iconColor}`}>
                          {icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${s.badge}`}>
                              {ins.insight_type}
                            </span>
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                              {fmtDate(ins.created_at)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                            {ins.message}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Section>

            {/* ── SECTION 3: Spending Reflection ────────────────────────────── */}
            <Section
              title="Spending Reflection"
              subtitle="Review your discretionary purchases and spot where you could save"
            >
              {wantExpenses.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
                  No want-tagged transactions yet. Upload a statement and tag your expenses.
                </p>
              ) : (
                <div className="space-y-3">
                  {wantExpenses.map(exp => {
                    const choice = reflections[exp.id]
                    const saving = Math.round(exp.amount * 0.5)
                    return (
                      <div
                        key={exp.id}
                        className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                      >
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">{exp.title}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{exp.category}</p>
                          </div>
                          <span className="text-sm font-bold text-gray-900 dark:text-white flex-shrink-0">
                            {fmt(exp.amount)}
                          </span>
                        </div>

                        {!choice ? (
                          <>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2.5">
                              Was this necessary, or could it be reduced in future?
                            </p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setReflections(p => ({ ...p, [exp.id]: 'necessary' }))}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                              >
                                Necessary
                              </button>
                              <button
                                onClick={() => setReflections(p => ({ ...p, [exp.id]: 'reduce' }))}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                              >
                                Could be reduced
                              </button>
                            </div>
                          </>
                        ) : choice === 'necessary' ? (
                          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                              {I.check} Marked as necessary
                            </span>
                            <button
                              onClick={() => setReflections(p => ({ ...p, [exp.id]: undefined }))}
                              className="underline hover:no-underline ml-auto"
                            >
                              Change
                            </button>
                          </div>
                        ) : (
                          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                            <p className="text-xs font-semibold text-green-800 dark:text-green-300 mb-0.5">
                              Savings tip
                            </p>
                            <p className="text-xs text-green-700 dark:text-green-400">
                              Reducing this by 50% monthly would save you{' '}
                              <strong>{fmt(saving)}</strong> toward your{' '}
                              <strong>{savingsEnvelope}</strong>.
                            </p>
                            <button
                              onClick={() => setReflections(p => ({ ...p, [exp.id]: undefined }))}
                              className="text-xs text-green-600 dark:text-green-400 underline hover:no-underline mt-1.5"
                            >
                              Change answer
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </Section>

            {/* ── SECTION 4: Spending Pattern Analysis ──────────────────────── */}
            <Section
              title="Spending Pattern Analysis"
              subtitle="How your actual spending compares to your budget targets"
            >
              {expenses.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    No transaction data yet. Upload a statement to see your patterns.
                  </p>
                  <button
                    onClick={() => navigate('/upload')}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {I.upload} Upload a statement
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Overspending areas */}
                  {overspending.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                        Overspending areas
                      </p>
                      {overspending.map(b => {
                        const over = b.spent - b.budget
                        const cat  = topCat(b.key)
                        return (
                          <div
                            key={b.key}
                            className="flex gap-3 p-4 rounded-lg border border-red-100 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 mb-2"
                          >
                            <div
                              className="w-1 flex-shrink-0 rounded-full"
                              style={{ backgroundColor: b.color }}
                            />
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">{b.name}</p>
                                <span className="text-xs font-bold text-red-600 dark:text-red-400">
                                  +{fmt(over)} over
                                </span>
                              </div>
                              <p className="text-xs text-gray-600 dark:text-gray-400 mb-1.5">
                                Spent {fmt(b.spent)} of {fmt(b.budget)} budgeted
                              </p>
                              {cat && (
                                <p className="text-xs text-gray-500 dark:text-gray-500">
                                  Top category: <strong>{cat.name}</strong> ({fmt(cat.amount)})
                                  {' — '}
                                  reducing by {fmt(over / 4)} per week brings you back on track
                                </p>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Positive pattern */}
                  {positive.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                        Positive pattern
                      </p>
                      {positive.map(b => {
                        const under = b.budget - b.spent
                        return (
                          <div
                            key={b.key}
                            className="flex gap-3 p-4 rounded-lg border border-green-100 dark:border-green-900/40 bg-green-50 dark:bg-green-900/10"
                          >
                            <div
                              className="w-1 flex-shrink-0 rounded-full"
                              style={{ backgroundColor: b.color }}
                            />
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">{b.name}</p>
                                <span className="text-xs font-bold text-green-600 dark:text-green-400">
                                  {fmt(under)} under budget
                                </span>
                              </div>
                              <p className="text-xs text-gray-600 dark:text-gray-400">
                                Spent {fmt(b.spent)} of {fmt(b.budget)} — the {fmt(under)} surplus could
                                boost your {savingsEnvelope}.
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* All on track */}
                  {overspending.length === 0 && positive.length === 0 && (
                    <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                      Add more transactions to see pattern analysis.
                    </p>
                  )}
                </div>
              )}
            </Section>

            {/* ── Report Download ────────────────────────────────────────────── */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-6 py-5">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
                Download Report
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                Get a full PDF summary of your budget, FAS score, insights, and personalised strategy
              </p>
              <button
                onClick={() => { setReportError(''); setShowReportModal(true) }}
                className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {I.download}
                Download Report
              </button>
            </div>

            <p className="text-center text-xs text-gray-400 dark:text-gray-600 pb-4">
              Financial Anxiety Scale (FAS) — Archuleta et al. 2013
            </p>

          </div>
        )}
      </div>

      {/* ── Report Modal ─────────────────────────────────────────────────────── */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowReportModal(false)}
          />
          <div className="relative bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl w-full max-w-sm p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Download Report</h3>
              <button
                onClick={() => setShowReportModal(false)}
                className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                {I.close}
              </button>
            </div>

            {/* Report type */}
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Report period</p>
            <div className="flex gap-2 mb-5">
              {[
                { value: 'day',     label: 'Daily'   },
                { value: 'weekly',  label: 'Weekly'  },
                { value: 'monthly', label: 'Monthly' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setModalReportType(value)}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                    modalReportType === value
                      ? 'bg-violet-600 border-violet-600 text-white'
                      : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-violet-400 dark:hover:border-violet-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Date range */}
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Date range</p>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">From</label>
                <input
                  type="date"
                  value={reportStartDate}
                  onChange={e => setReportStartDate(e.target.value)}
                  className="w-full text-xs px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">To</label>
                <input
                  type="date"
                  value={reportEndDate}
                  onChange={e => setReportEndDate(e.target.value)}
                  className="w-full text-xs px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            </div>

            {reportError && (
              <div className="flex items-start gap-2 mb-4 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                {I.warning}
                <span>{reportError}</span>
              </div>
            )}

            <button
              onClick={() => downloadReport(modalReportType, reportStartDate, reportEndDate)}
              disabled={!!reportLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {reportLoading ? I.spinner : I.download}
              {reportLoading ? 'Generating…' : 'Generate Report'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
