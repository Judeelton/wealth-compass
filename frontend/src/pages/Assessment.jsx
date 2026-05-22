import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Sidebar from '../components/Sidebar'

// ─── Question data ─────────────────────────────────────────────────────────────

// The 7 FAS questions — validated scale from Archuleta, Dale & Spann (2013), discussed in my literature review
const QUESTIONS = [
  'I feel anxious about my financial situation.',
  'I have difficulty sleeping because of my financial situation.',
  'I have difficulty concentrating on my school or work because of my financial situation.',
  'I am irritable because of my financial situation.',
  'I have difficulty controlling worrying about my financial situation.',
  'My muscles feel tense because of worries about my financial situation.',
  'I feel fatigued because I worry about my financial situation.',
]

// 5-point Likert scale — total range is 7 (all Never) to 35 (all Always)
const OPTIONS = [
  { value: 1, label: 'Never' },
  { value: 2, label: 'Rarely' },
  { value: 3, label: 'Sometimes' },
  { value: 4, label: 'Often' },
  { value: 5, label: 'Always' },
]

// ─── Scoring ───────────────────────────────────────────────────────────────────

// Score thresholds come directly from the original FAS paper
function getLevel(score) {
  if (score <= 14) return 'low'
  if (score <= 24) return 'moderate'
  return 'high'
}

// Each anxiety level gets its own colour scheme and a personalised message — not just a number
const LEVEL_CONFIG = {
  low: {
    label: 'Low Anxiety',
    scoreColor: 'text-green-600 dark:text-green-400',
    cardBg: 'bg-green-50 dark:bg-green-900/20',
    cardBorder: 'border-green-200 dark:border-green-800',
    badge: 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300',
    bar: 'bg-green-500',
    dot: 'bg-green-500',
    message:
      "You're coping well with your financial situation. Your scores suggest that while money is on your mind, it isn't overwhelming you — and that's a great foundation to build on. Keep doing what you're doing, and use Wealth Compass to stay on track.",
    meaning:
      "A low anxiety score means your finances aren't significantly disrupting your daily life. You may still have financial concerns — that's completely normal — but you're managing them effectively. The next step is to add structure to your spending with an envelope budget, which will help you stay in this healthy range.",
  },
  moderate: {
    label: 'Moderate Anxiety',
    scoreColor: 'text-amber-600 dark:text-amber-400',
    cardBg: 'bg-amber-50 dark:bg-amber-900/20',
    cardBorder: 'border-amber-200 dark:border-amber-800',
    badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300',
    bar: 'bg-amber-500',
    dot: 'bg-amber-500',
    message:
      "You're experiencing a moderate level of financial anxiety — and you're definitely not alone. Many students feel exactly this way, especially when balancing tuition, living costs, and an uncertain future. The important thing is that awareness is the first step, and small, consistent changes make a real difference.",
    meaning:
      "Moderate anxiety means money worries are affecting some areas of your life but haven't become overwhelming. With the right tools — envelope budgeting, regular spending check-ins, and the right mindset — you can meaningfully reduce this score over the coming months. Wealth Compass is designed specifically for this.",
  },
  high: {
    label: 'High Anxiety',
    scoreColor: 'text-rose-600 dark:text-rose-400',
    cardBg: 'bg-rose-50 dark:bg-rose-900/20',
    cardBorder: 'border-rose-200 dark:border-rose-800',
    badge: 'bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-300',
    bar: 'bg-rose-500',
    dot: 'bg-rose-500',
    message:
      "Your scores suggest you're experiencing significant financial anxiety — and we want you to know: this is more common among students than you might think, and it says nothing about your worth or ability. You've taken a really important and brave step just by measuring it. That's where change begins.",
    meaning:
      "High financial anxiety can affect your sleep, concentration, relationships, and physical health. The most important thing right now is that you have a baseline — a number you can actually track and reduce. From here, Wealth Compass will help you understand your spending patterns, build structure, and give you personalised insights. You don't have to figure this out alone.",
  },
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function ChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
    </svg>
  )
}

function CheckCircle() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  )
}

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE  = 'http://127.0.0.1:8000'
const TOKEN_KEY = 'wc-token'

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function Assessment() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [answers, setAnswers] = useState(Array(QUESTIONS.length).fill(null))
  const [showResults, setShowResults] = useState(false)
  const [saveError, setSaveError] = useState('')

  const currentAnswer = answers[currentQuestion]
  const progress = ((currentQuestion + 1) / QUESTIONS.length) * 100

  // Spread into a new array so React sees the change — can't mutate state directly
  function selectAnswer(value) {
    setAnswers(prev => {
      const next = [...prev]
      next[currentQuestion] = value
      return next
    })
  }

  function handleBack() {
    if (currentQuestion > 0) setCurrentQuestion(q => q - 1)
  }

  function handleNext() {
    if (currentQuestion < QUESTIONS.length - 1) setCurrentQuestion(q => q + 1)
  }

  async function handleViewResults() {
    const finalScore = answers.reduce((sum, a) => sum + a, 0)
    // Show results immediately — don't make them wait for the network call
    setShowResults(true)

    try {
      const token = localStorage.getItem(TOKEN_KEY)
      // Using fetch directly here so a 401 doesn't trigger the axios interceptor and kick them out
      const res = await fetch(`${API_BASE}/api/assessment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ stress_score: finalScore }),
      })
      if (!res.ok) throw new Error('Save failed')
    } catch {
      setSaveError('Your score could not be saved to your account. Your result is still shown below.')
    }
  }

  // Reset everything so they can go again — answers, question index, results view
  function handleRetake() {
    setAnswers(Array(QUESTIONS.length).fill(null))
    setCurrentQuestion(0)
    setShowResults(false)
    setSaveError('')
  }

  // ── Results screen ────────────────────────────────────────────────────────────

  if (showResults) {
    const score = answers.reduce((sum, a) => sum + a, 0)
    const level = getLevel(score)
    const cfg = LEVEL_CONFIG[level]
    // Scale from [7, 35] to [0, 100%] — 7 is the minimum possible score (all Never)
    const barWidth = Math.round(((score - 7) / 28) * 100)

    return (
      <div className="flex overflow-hidden" style={{ height: '100vh' }}>
        <Sidebar user={user} />

        <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
          <div className="max-w-2xl mx-auto px-6 py-8">

            {/* Page header */}
            <div className="text-center mb-8">
              <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 mb-2 uppercase tracking-wide">
                Assessment complete
              </p>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Your Results</h1>
            </div>

            {/* Save-error banner */}
            {saveError && (
              <div className="mb-6 flex items-start gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="#d97706" style={{ flexShrink: 0, marginTop: '2px' }}>
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <p className="text-sm text-amber-700 dark:text-amber-400">{saveError}</p>
              </div>
            )}

            {/* Score card */}
            <div className={`rounded-2xl border-2 p-8 mb-5 text-center ${cfg.cardBg} ${cfg.cardBorder}`}>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-5">
                Financial Anxiety Scale Score
              </p>

              <div className="flex items-end justify-center gap-2 mb-5">
                <span className={`text-8xl font-bold leading-none ${cfg.scoreColor}`}>{score}</span>
                <span className="text-xl text-gray-400 dark:text-gray-500 mb-3">/ 35</span>
              </div>

              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-2 overflow-hidden">
                <div
                  className={`h-3 rounded-full ${cfg.bar} transition-all duration-1000`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mb-6">
                <span>7 — Low</span>
                <span>35 — High</span>
              </div>

              <span className={`inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold ${cfg.badge}`}>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                {cfg.label}
              </span>
            </div>

            {/* Personalised message */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-4">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
                What your score means
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                {cfg.message}
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-8">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
                What this means for you
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                {cfg.meaning}
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pb-8">
              <button
                onClick={handleRetake}
                className="flex-1 py-3 px-6 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Retake assessment
              </button>
              <button
                onClick={() => navigate('/budget-setup')}
                className="flex-1 py-3 px-6 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
              >
                Continue to budget setup →
              </button>
            </div>

          </div>
        </div>
      </div>
    )
  }

  // ── Question screen ───────────────────────────────────────────────────────────

  return (
    <div className="flex overflow-hidden" style={{ height: '100vh' }}>
      <Sidebar user={user} />

      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
        <div className="max-w-2xl mx-auto px-6 py-8">

          {/* Page header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
              Financial Anxiety Assessment
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Answer honestly — there are no right or wrong answers. This helps us personalise your experience.
            </p>
          </div>

          {/* Progress bar */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Question {currentQuestion + 1} of {QUESTIONS.length}
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {Math.round(progress)}% complete
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
              <div
                className="h-2 bg-indigo-600 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Question card — big touch-friendly buttons rather than radio inputs, easier on mobile */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 mb-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-4">
              Question {currentQuestion + 1}
            </p>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-8 leading-snug">
              {QUESTIONS[currentQuestion]}
            </h2>

            <div className="space-y-3">
              {OPTIONS.map(option => {
                const selected = currentAnswer === option.value
                return (
                  <button
                    key={option.value}
                    onClick={() => selectAnswer(option.value)}
                    className={`w-full flex items-center gap-4 p-4 rounded-lg border-2 text-left transition-all duration-150 ${
                      selected
                        ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30'
                        : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-colors ${
                      selected
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                    }`}>
                      {option.value}
                    </span>

                    <span className={`font-medium text-sm flex-1 transition-colors ${
                      selected
                        ? 'text-indigo-700 dark:text-indigo-300'
                        : 'text-gray-700 dark:text-gray-300'
                    }`}>
                      {option.label}
                    </span>

                    {selected && (
                      <span className="text-indigo-600 dark:text-indigo-400">
                        <CheckCircle />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Navigation — Next/Submit is disabled until they've answered the current question */}
          <div className="flex justify-between items-center pb-8">
            <button
              onClick={handleBack}
              disabled={currentQuestion === 0}
              className="flex items-center gap-2 px-6 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft />
              Back
            </button>

            {currentQuestion < QUESTIONS.length - 1 ? (
              <button
                onClick={handleNext}
                disabled={currentAnswer === null}
                className="flex items-center gap-2 px-6 py-3 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
                <ChevronRight />
              </button>
            ) : (
              <button
                onClick={handleViewResults}
                disabled={currentAnswer === null}
                className="flex items-center gap-2 px-6 py-3 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                See my results
                <ChevronRight />
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
