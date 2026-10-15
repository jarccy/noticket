import type { WebhookEvent, CalendarEvent, AppSettings } from '@/types'
import type { AuthUser } from '@/lib/auth'

/** Backend Go (notiback) que persiste los datos en PostgreSQL. */
export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8080'

// ---------- Token de sesión ----------
// "Recordarme" → localStorage (sobrevive al cierre); si no → sessionStorage (al cerrar, vuelve al login).

const TOKEN_KEY = 'noticket_token'

export const TokenStore = {
  get(): string | null {
    try {
      return sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set(token: string, remember: boolean) {
    try {
      this.clear()
      ;(remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token)
    } catch {
      // almacenamiento bloqueado: la sesión dura lo que la pestaña
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      // ignore
    }
  },
}

/** Se dispara cuando el backend responde 401 (sesión caducada o cerrada en otro sitio). */
export const UNAUTHORIZED_EVENT = 'noticket:unauthorized'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = TokenStore.get()
  let res: Response
  try {
    res = await fetch(API_URL + path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...init?.headers,
      },
    })
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor. ¿Está arrancado notiback?')
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    if (res.status === 401 && token && !path.startsWith('/api/auth/login')) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    }
    throw new ApiError(res.status, data?.message || `${init?.method || 'GET'} ${path} → ${res.status}`)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

const body = (data: unknown) => JSON.stringify(data)

/** Las escrituras no bloquean la UI: si el backend falla, queda en localStorage. */
function fireAndForget(p: Promise<unknown>) {
  p.catch((err) => console.warn('[api] no se pudo guardar en el backend', err))
}

export interface SessionResponse {
  token: string
  expiresAt: string
  user: AuthUser
}

export const AuthApi = {
  providers: () => request<{ google: boolean }>('/api/auth/providers'),
  me: () => request<{ user: AuthUser }>('/api/auth/me'),
  login: (email: string, password: string, remember: boolean) =>
    request<SessionResponse>('/api/auth/login', { method: 'POST', body: body({ email, password, remember }) }),
  register: (name: string, email: string, password: string, remember: boolean) =>
    request<SessionResponse>('/api/auth/register', { method: 'POST', body: body({ name, email, password, remember }) }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  forgotPassword: (email: string) =>
    request<{ message: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: body({ email, redirectTo: window.location.origin }),
    }),
  validateResetToken: (token: string) =>
    request<{ valid: boolean }>('/api/auth/reset-password/validate', { method: 'POST', body: body({ token }) }),
  resetPassword: (token: string, password: string) =>
    request<{ message: string }>('/api/auth/reset-password', { method: 'POST', body: body({ token, password }) }),
  googleExchange: (code: string, remember: boolean) =>
    request<SessionResponse>('/api/auth/google/exchange', { method: 'POST', body: body({ code, remember }) }),
  /** URL a la que se navega (no fetch) para empezar el login con Google. */
  googleStartUrl: () => `${API_URL}/api/auth/google?redirect_to=${encodeURIComponent(window.location.origin)}`,
  /** URL del stream SSE con el token (EventSource no admite cabeceras). */
  eventsUrl: () => `${API_URL}/api/events?access_token=${encodeURIComponent(TokenStore.get() ?? '')}`,
}

export const Api = {
  getEvents: () => request<WebhookEvent[]>('/api/webhooks'),
  getCalendarEvents: () => request<CalendarEvent[]>('/api/calendar'),
  getSettings: () => request<AppSettings>('/api/settings'),

  saveEvent: (event: WebhookEvent) =>
    fireAndForget(request('/api/webhooks', { method: 'POST', body: body(event) })),
  markAsRead: (id: string) =>
    fireAndForget(request(`/api/webhooks/${encodeURIComponent(id)}/read`, { method: 'PATCH' })),
  markAllAsRead: () => fireAndForget(request('/api/webhooks/read-all', { method: 'POST' })),
  clearEvents: () => fireAndForget(request('/api/webhooks', { method: 'DELETE' })),

  saveCalendarEvent: (event: CalendarEvent) =>
    fireAndForget(request(`/api/calendar/${encodeURIComponent(event.id)}`, { method: 'PUT', body: body(event) })),
  deleteCalendarEvent: (id: string) =>
    fireAndForget(request(`/api/calendar/${encodeURIComponent(id)}`, { method: 'DELETE' })),

  saveSettings: (settings: Partial<AppSettings>) =>
    fireAndForget(request('/api/settings', { method: 'PATCH', body: body(settings) })),

  // Para la sincronización: esperan la respuesta para saber qué se subió
  uploadEvent: (event: WebhookEvent) => request('/api/webhooks', { method: 'POST', body: body(event) }),
  uploadCalendarEvent: (event: CalendarEvent) =>
    request(`/api/calendar/${encodeURIComponent(event.id)}`, { method: 'PUT', body: body(event) }),
}
