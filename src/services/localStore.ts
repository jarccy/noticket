import { invoke } from '@tauri-apps/api/core'
import type { CalendarEvent, WebhookEndpoint, WebhookEvent } from '@/types'
import { isTauri } from '@/lib/platform'
import { Storage } from '@/services/storage'

/**
 * Espacio local: lo que se crea sin sesión iniciada.
 * - App de escritorio: SQLite (lo gestiona Rust; los webhooks se guardan allí al llegar,
 *   aunque la ventana esté oculta).
 * - Navegador: localStorage.
 * Al iniciar sesión, «Sincronizar» lo sube a la base del backend y lo quita de aquí.
 */
export interface LocalStore {
  /** Endpoints configurables: solo en la app de escritorio (el navegador no recibe HTTP). */
  readonly supportsEndpoints: boolean
  init(): Promise<void>

  listEvents(): Promise<WebhookEvent[]>
  /** Guarda un evento creado en la app (los que llegan por HTTP ya los guarda Rust). */
  saveEvent(event: WebhookEvent): Promise<void>
  markRead(ids: string[]): Promise<void>
  markAllRead(): Promise<void>
  deleteEvents(ids: string[]): Promise<void>
  clearEvents(): Promise<void>

  listCalendar(): Promise<CalendarEvent[]>
  saveCalendar(event: CalendarEvent): Promise<void>
  deleteCalendar(ids: string[]): Promise<void>

  listEndpoints(): Promise<WebhookEndpoint[]>
  saveEndpoint(endpoint: WebhookEndpoint): Promise<WebhookEndpoint>
  deleteEndpoints(ids: string[]): Promise<void>

  pendingCount(): Promise<number>
}

// ---------- App de escritorio: SQLite ----------

const sqliteStore: LocalStore = {
  supportsEndpoints: true,

  /** Primera ejecución con SQLite: trae lo que versiones anteriores guardaban en localStorage. */
  async init() {
    const events = Storage.getEvents()
    const calendar = Storage.getCalendarEvents()
    const imported = await invoke<boolean>('db_import_legacy', { events, calendar })
    if (imported) Storage.clearLocalData()
  },

  listEvents: () => invoke<WebhookEvent[]>('db_list_events', { limit: 1000 }),
  saveEvent: (event) => invoke('db_save_event', { event }),
  markRead: (ids) => invoke('db_mark_read', { ids }),
  markAllRead: () => invoke('db_mark_all_read'),
  deleteEvents: async (ids) => {
    await invoke('db_delete_events', { ids })
  },
  clearEvents: () => invoke('db_clear_events'),

  listCalendar: () => invoke<CalendarEvent[]>('db_list_calendar'),
  saveCalendar: (event) => invoke('db_save_calendar', { event }),
  deleteCalendar: async (ids) => {
    await invoke('db_delete_calendar', { ids })
  },

  listEndpoints: () => invoke<WebhookEndpoint[]>('db_list_endpoints'),
  saveEndpoint: (endpoint) => invoke<WebhookEndpoint>('db_save_endpoint', { endpoint }),
  deleteEndpoints: async (ids) => {
    await invoke('db_delete_endpoints', { ids })
  },

  pendingCount: () => invoke<number>('db_pending_count'),
}

// ---------- Navegador: localStorage ----------

const upsert = <T extends { id: string }>(list: T[], item: T) => [item, ...list.filter((x) => x.id !== item.id)]

const browserStore: LocalStore = {
  supportsEndpoints: false,
  async init() {},

  listEvents: async () => Storage.getEvents(),
  saveEvent: async (event) => Storage.saveEvents(upsert(Storage.getEvents(), event)),
  markRead: async (ids) => {
    const set = new Set(ids)
    Storage.saveEvents(Storage.getEvents().map((e) => (set.has(e.id) ? { ...e, read: true } : e)))
  },
  markAllRead: async () => Storage.saveEvents(Storage.getEvents().map((e) => ({ ...e, read: true }))),
  deleteEvents: async (ids) => Storage.removeEvents(new Set(ids)),
  clearEvents: async () => Storage.saveEvents([]),

  listCalendar: async () => Storage.getCalendarEvents(),
  saveCalendar: async (event) => Storage.saveCalendarEvents(upsert(Storage.getCalendarEvents(), event)),
  deleteCalendar: async (ids) => Storage.removeCalendarEvents(new Set(ids)),

  listEndpoints: async () => [],
  saveEndpoint: async () => {
    throw new Error('Los endpoints sin backend solo están disponibles en la app de escritorio')
  },
  deleteEndpoints: async () => {},

  pendingCount: async () => Storage.pendingCount(),
}

export const localStore: LocalStore = isTauri() ? sqliteStore : browserStore

// ---------- Helpers de endpoints ----------

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('')
}

export const newEndpointId = () => 'ep_' + randomHex(8)
export const newEndpointSecret = () => 'whs_' + randomHex(24)
