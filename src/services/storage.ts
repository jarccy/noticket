import type { WebhookEvent, CalendarEvent, AppSettings } from '@/types'

/**
 * Espacio local (localStorage): lo que se crea sin sesión iniciada. Al iniciar sesión,
 * el botón "Sincronizar" lo sube a la base de datos y lo quita de aquí.
 * Los ajustes se guardan siempre en local (también los usa la ventana de notificaciones).
 */
const STORAGE_KEYS = {
  EVENTS: 'noticket_events',
  CALENDAR: 'noticket_calendar',
  SETTINGS: 'noticket_settings',
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

  /** Cuántos elementos locales faltan por subir a la base. */
  pendingCount(): number {
    return this.getEvents().length + this.getCalendarEvents().length
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
