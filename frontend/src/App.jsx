import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import PageSpinner from './components/PageSpinner'

const Login        = lazy(() => import('./pages/Login'))
const Register     = lazy(() => import('./pages/Register'))
const Assessment   = lazy(() => import('./pages/Assessment'))
const BudgetSetup  = lazy(() => import('./pages/BudgetSetup'))
const Dashboard    = lazy(() => import('./pages/Dashboard'))
const EnvelopeSetup = lazy(() => import('./pages/EnvelopeSetup'))
const Upload       = lazy(() => import('./pages/Upload'))
const Insights     = lazy(() => import('./pages/Insights'))

// ─── Route guards ─────────────────────────────────────────────────────────────

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? children : <Navigate to="/login" replace />
}

// ─── Router ───────────────────────────────────────────────────────────────────

function AppRoutes() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route path="/assessment"   element={<ProtectedRoute><Assessment /></ProtectedRoute>} />
        <Route path="/budget-setup" element={<ProtectedRoute><BudgetSetup /></ProtectedRoute>} />
        <Route path="/dashboard"    element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/envelope-setup" element={<ProtectedRoute><EnvelopeSetup /></ProtectedRoute>} />
        <Route path="/upload"       element={<ProtectedRoute><Upload /></ProtectedRoute>} />
        <Route path="/insights"     element={<ProtectedRoute><Insights /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
