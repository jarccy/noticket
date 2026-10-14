import type { WebhookEvent, CalendarEvent, AppSettings } from '@/types'

/** Backend Go (notiback) que persiste los datos en PostgreSQL. */
export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8080'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API_URL + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    throw new Error(`${init?.method || 'GET'} ${path} → ${res.status}`)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

const body = (data: unknown) => JSON.stringify(data)

/** Las escrituras no bloquean la UI: si el backend falla, queda en localStorage. */
function fireAndForget(p: Promise<unknown>) {
  p.catch((err) => console.warn('[api] no se pudo guardar en el backend', err))
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
}
