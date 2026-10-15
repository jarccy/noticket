import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { AuthApi, TokenStore, UNAUTHORIZED_EVENT, type SessionResponse } from '@/services/api'
import { AUTH_ERRORS, type AuthUser } from '@/lib/auth'

type AuthStatus = 'loading' | 'anonymous' | 'authenticated'

interface AuthContextType {
  status: AuthStatus
  user: AuthUser | null
  /** Error con el que se volvió del login de Google (para mostrarlo en la pantalla de login). */
  initialError: string | null
  login: (email: string, password: string, remember: boolean) => Promise<void>
  register: (name: string, email: string, password: string, remember: boolean) => Promise<void>
  logout: () => Promise<void>
  /** El login es opcional: la pantalla de acceso solo se muestra al pedirla. */
  authOpen: boolean
  openAuth: () => void
  closeAuth: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Preferencia de "Recordarme" para el login con Google (la página se recarga al volver de Google)
const GOOGLE_REMEMBER_KEY = 'noticket_google_remember'

export function rememberForGoogle(remember: boolean) {
  try {
    sessionStorage.setItem(GOOGLE_REMEMBER_KEY, remember ? '1' : '0')
  } catch {
    // ignore
  }
}

/** Lee y quita de la URL los parámetros de vuelta de Google (?google_code / ?auth_error). */
function takeAuthParams(): { googleCode: string | null; authError: string | null } {
  const url = new URL(window.location.href)
  const googleCode = url.searchParams.get('google_code')
  const authError = url.searchParams.get('auth_error')
  if (googleCode || authError) {
    url.searchParams.delete('google_code')
    url.searchParams.delete('auth_error')
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  }
  return { googleCode, authError }
}

// Una sola vez por carga de página: el código de Google es de un solo uso y StrictMode
// ejecuta los efectos dos veces en desarrollo.
const bootParams = takeAuthParams()
let googleExchange: Promise<{ session: SessionResponse; remember: boolean }> | null = null

function exchangeGoogleCodeOnce(code: string) {
  if (!googleExchange) {
    let remember = false
    try {
      remember = sessionStorage.getItem(GOOGLE_REMEMBER_KEY) === '1'
      sessionStorage.removeItem(GOOGLE_REMEMBER_KEY)
    } catch {
      // ignore
    }
    googleExchange = AuthApi.googleExchange(code, remember).then((session) => ({ session, remember }))
  }
  return googleExchange
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [initialError, setInitialError] = useState<string | null>(null)
  // Se abre al llegar desde un enlace de restablecimiento o al volver de Google con un error
  const [authOpen, setAuthOpen] = useState(
    () => !!bootParams.authError || window.location.pathname === '/reset-password'
  )

  const openAuth = useCallback(() => setAuthOpen(true), [])
  const closeAuth = useCallback(() => setAuthOpen(false), [])

  const startSession = useCallback((s: SessionResponse, remember: boolean) => {
    TokenStore.set(s.token, remember)
    setUser(s.user)
    setStatus('authenticated')
    setAuthOpen(false)
  }, [])

  const endSession = useCallback(() => {
    TokenStore.clear()
    setUser(null)
    setStatus('anonymous')
  }, [])

  // Arranque: canjear el código de Google si venimos de allí; si no, validar el token guardado
  useEffect(() => {
    let cancelled = false
    const { googleCode, authError } = bootParams

    const boot = async () => {
      if (authError) {
        setInitialError(AUTH_ERRORS[authError] ?? 'No se pudo iniciar sesión.')
      }
      if (googleCode) {
        try {
          const { session, remember } = await exchangeGoogleCodeOnce(googleCode)
          if (!cancelled) startSession(session, remember)
          return
        } catch (err) {
          if (!cancelled) {
            setInitialError((err as Error).message)
            setAuthOpen(true)
          }
        }
      }
      if (!TokenStore.get()) {
        if (!cancelled) setStatus('anonymous')
        return
      }
      try {
        const { user } = await AuthApi.me()
        if (!cancelled) {
          setUser(user)
          setStatus('authenticated')
        }
      } catch {
        if (!cancelled) endSession()
      }
    }
    boot()
    return () => {
      cancelled = true
    }
  }, [startSession, endSession])

  // Cualquier 401 del backend (sesión caducada/revocada) devuelve al login
  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, endSession)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, endSession)
  }, [endSession])

  const login = useCallback(
    async (email: string, password: string, remember: boolean) => {
      startSession(await AuthApi.login(email, password, remember), remember)
    },
    [startSession]
  )

  const register = useCallback(
    async (name: string, email: string, password: string, remember: boolean) => {
      startSession(await AuthApi.register(name, email, password, remember), remember)
    },
    [startSession]
  )

  const logout = useCallback(async () => {
    try {
      await AuthApi.logout()
    } catch {
      // aunque falle el backend, se cierra en local
    }
    endSession()
  }, [endSession])

  return (
    <AuthContext.Provider
      value={{ status, user, initialError, login, register, logout, authOpen, openAuth, closeAuth }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
