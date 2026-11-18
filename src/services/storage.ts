import type { WebhookEvent, CalendarEvent, AppSettings } from '@/types'

/**
 * localStorage: ajustes (siempre en local; también los usa la ventana de notificaciones)
 * y, en el navegador, el espacio local sin sesión. En la app de escritorio el espacio
 * local vive en SQLite (ver services/localStore.ts).
 */
const STORAGE_KEYS = {
  EVENTS: 'noticket_events',
  CALENDAR: 'noticket_calendar',
  SETTINGS: 'noticket_settings',
  LOCAL_SECRET: 'noticket_local_webhook_secret',
}

function randomSecret(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return 'lk_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

// Datos de ejemplo de versiones anteriores: nunca se muestran ni se sincronizan
const DEMO_IDS = new Set(['wh_init_1', 'wh_init_2', 'wh_init_3', 'wh_init_4', 'cal_1', 'cal_2', 'cal_3'])

const DEFAULT_SETTINGS: AppSettings = {
  soundEnabled: true,
  desktopNotificationsEnabled: true,
  autoCalendarSync: true,
  webhookSecret: '',
  theme: 'dark',
  accentColor: 'mono',
  customAccent: '#0f766e',
}

function readList<T extends { id: string }>(key: string): T[] {
  try {
    const data = localStorage.getItem(key)
    const list = data ? JSON.parse(data) : []
    return Array.isArray(list) ? list.filter((item: T) => item && !DEMO_IDS.has(item.id)) : []
  } catch {
    return []
  }
}

function writeList(key: string, list: unknown[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list))
  } catch (e) {
    console.warn(`Could not save ${key} to localStorage`, e)
  }
}

export const Storage = {
  getEvents(): WebhookEvent[] {
    return readList<WebhookEvent>(STORAGE_KEYS.EVENTS)
  },

  saveEvents(events: WebhookEvent[]) {
    writeList(STORAGE_KEYS.EVENTS, events)
  },

  /** Quita del espacio local los eventos ya subidos a la base. */
  removeEvents(ids: Set<string>) {
    writeList(STORAGE_KEYS.EVENTS, this.getEvents().filter((e) => !ids.has(e.id)))
  },

  getCalendarEvents(): CalendarEvent[] {
    return readList<CalendarEvent>(STORAGE_KEYS.CALENDAR)
  },

  saveCalendarEvents(events: CalendarEvent[]) {
    writeList(STORAGE_KEYS.CALENDAR, events)
  },

  removeCalendarEvents(ids: Set<string>) {
    writeList(STORAGE_KEYS.CALENDAR, this.getCalendarEvents().filter((c) => !ids.has(c.id)))
  },

  /** Borra los webhooks y el calendario locales (tras migrarlos a SQLite). */
  clearLocalData() {
    try {
      localStorage.removeItem(STORAGE_KEYS.EVENTS)
      localStorage.removeItem(STORAGE_KEYS.CALENDAR)
    } catch {
      // ignore
    }
  },

  /** Cuántos elementos locales faltan por subir a la base. */
  pendingCount(): number {
    return this.getEvents().length + this.getCalendarEvents().length
  },

  /**
   * Secreto del modo local (sin backend): autoriza los webhooks que llegan al puerto 3690
   * desde otros equipos. Se crea la primera vez y no sale de este equipo.
   */
  getLocalWebhookSecret(): string {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.LOCAL_SECRET)
      if (saved) return saved
    } catch {
      // sin localStorage: se genera uno nuevo
    }
    return this.regenerateLocalWebhookSecret()
  },

  regenerateLocalWebhookSecret(): string {
    const secret = randomSecret()
    try {
      localStorage.setItem(STORAGE_KEYS.LOCAL_SECRET, secret)
    } catch (e) {
      console.warn('Could not save local webhook secret', e)
    }
    return secret
  },

  getSettings(): AppSettings {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS)
      return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS
    } catch {
      return DEFAULT_SETTINGS
    }
  },

  saveSettings(settings: AppSettings) {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings))
    } catch (e) {
      console.warn('Could not save settings', e)
    }
  },
}
