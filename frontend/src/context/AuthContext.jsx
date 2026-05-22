import { createContext, useContext, useState, useCallback } from 'react'

const AuthContext = createContext(null)

const TOKEN_KEY = 'wc-token'
const API_BASE = 'http://localhost:8000/api'

export function AuthProvider({ children }) {
  // Initialise from localStorage so the user stays logged in across page refreshes
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState(null)
  const [error, setError] = useState(null)

  const isAuthenticated = Boolean(token)

  /** Persist a JWT token and mark the user as authenticated. */
  function persistToken(newToken) {
    localStorage.setItem(TOKEN_KEY, newToken)
    setToken(newToken)
    setError(null)
  }

  /**
   * Register a new account.
   * @param {string} name
   * @param {string} email
   * @param {string} password
   */
  const register = useCallback(async (name, email, password) => {
    setError(null)
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    })

    const data = await res.json()

    if (!res.ok) {
      const message = data.detail ?? 'Registration failed'
      setError(message)
      throw new Error(message)
    }

    persistToken(data.access_token)
    setUser(data.user ?? null)
    return data
  }, [])

  /**
   * Log in with existing credentials.
   * @param {string} email
   * @param {string} password
   */
  const login = useCallback(async (email, password) => {
    setError(null)
    // FastAPI's OAuth2PasswordRequestForm expects form-encoded data
    const form = new URLSearchParams({ username: email, password })
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    })

    const data = await res.json()

    if (!res.ok) {
      const message = data.detail ?? 'Login failed'
      setError(message)
      throw new Error(message)
    }

    persistToken(data.access_token)
    setUser(data.user ?? null)
    return data
  }, [])

  /** Clear all auth state and remove the token from storage. */
  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
    setError(null)
  }, [])

  /**
   * Returns headers with Authorization pre-filled.
   * Useful for authenticated fetch calls anywhere in the app.
   */
  function authHeaders(extra = {}) {
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    }
  }

  return (
    <AuthContext.Provider
      value={{ token, user, isAuthenticated, error, login, logout, register, authHeaders }}
    >
      {children}
    </AuthContext.Provider>
  )
}

/** Hook for consuming auth context anywhere in the component tree. */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
