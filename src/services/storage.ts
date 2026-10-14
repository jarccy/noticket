import type { WebhookEvent, CalendarEvent, AppSettings } from '@/types'

const STORAGE_KEYS = {
  EVENTS: 'noticket_events',
  CALENDAR: 'noticket_calendar',
  SETTINGS: 'noticket_settings',
}

const todayStr = new Date().toISOString().split('T')[0]
const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0]
const inTwoDaysStr = new Date(Date.now() + 172800000).toISOString().split('T')[0]

const DEFAULT_EVENTS: WebhookEvent[] = [
  {
    id: 'wh_init_1',
    title: 'Despliegue a Producción Exitoso',
    message: 'Versión 3.2.0 desplegada en clúster k8s de Frankfurt sin incidencias.',
    type: 'success',
    source: 'GitHub Actions',
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    read: false,
    rawPayload: {
      event: 'deployment.success',
      repo: 'main-api',
      release: 'v3.2.0',
      duration: '4m 12s',
      environment: 'production',
    },
  },
  {
    id: 'wh_init_2',
    title: 'Planificación de Sprint Q4',
    message: 'Reunión de sincronización y asignación de tickets de fin de año.',
    type: 'calendar',
    source: 'Jira Automations',
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    date: todayStr,
    time: '16:00',
    category: 'Reunión',
    read: false,
    rawPayload: {
      summary: 'Planificación de Sprint Q4',
      date: todayStr,
      time: '16:00',
      attendees: 6,
      platform: 'Google Meet',
    },
  },
  {
    id: 'wh_init_3',
    title: 'Alerta: Memoria RAM al 89%',
    message: 'El pod redis-cache-01 ha superado el umbral de advertencia.',
    type: 'warning',
    source: 'Datadog',
    timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    read: true,
    rawPayload: {
      alert: 'HighMemoryUsage',
      metric: 'node_memory_active_bytes',
      threshold: '85%',
      current: '89.2%',
    },
  },
  {
    id: 'wh_init_4',
    title: 'Pago Recibido de Suscripción Enterprise',
    message: 'Cliente Acme Corp ha renovado el plan anual por $12,400 USD.',
    type: 'success',
    source: 'Stripe Webhooks',
    timestamp: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
    read: true,
    rawPayload: {
      event: 'invoice.payment_succeeded',
      customer: 'Acme Corp',
      amount: 1240000,
      currency: 'usd',
    },
  },
]

const DEFAULT_CALENDAR_EVENTS: CalendarEvent[] = [
  {
    id: 'cal_1',
    title: 'Planificación de Sprint Q4',
    description: 'Reunión de sincronización y asignación de tickets de fin de año.',
    date: todayStr,
    time: '16:00',
    type: 'calendar',
    category: 'Reunión',
    source: 'Jira Automations',
    webhookId: 'wh_init_2',
  },
  {
    id: 'cal_2',
    title: 'Ventana de Mantenimiento Base de Datos',
    description: 'Actualización de versión mayor de PostgreSQL y optimización de índices.',
    date: tomorrowStr,
    time: '02:00',
    type: 'warning',
    category: 'Mantenimiento',
    source: 'AWS RDS',
  },
  {
    id: 'cal_3',
    title: 'Demo de Producto con Inversores',
    description: 'Presentación de nuevas capacidades del Dashboard y Webhooks en tiempo real.',
    date: inTwoDaysStr,
    time: '11:00',
    type: 'info',
    category: 'Presentación',
    source: 'Calendly Webhook',
  },
]

const DEFAULT_SETTINGS: AppSettings = {
  soundEnabled: true,
  desktopNotificationsEnabled: true,
  autoCalendarSync: true,
  webhookSecret: '',
  theme: 'dark',
  accentColor: 'mono',
  customAccent: '#0f766e',
}

export const Storage = {
  getEvents(): WebhookEvent[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.EVENTS)
      return data ? JSON.parse(data) : DEFAULT_EVENTS
    } catch {
      return DEFAULT_EVENTS
    }
  },

  saveEvents(events: WebhookEvent[]) {
    try {
      localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(events))
    } catch (e) {
      console.warn('Could not save events to localStorage', e)
    }
  },

  getCalendarEvents(): CalendarEvent[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CALENDAR)
      return data ? JSON.parse(data) : DEFAULT_CALENDAR_EVENTS
    } catch {
      return DEFAULT_CALENDAR_EVENTS
    }
  },

  saveCalendarEvents(events: CalendarEvent[]) {
    try {
      localStorage.setItem(STORAGE_KEYS.CALENDAR, JSON.stringify(events))
    } catch (e) {
      console.warn('Could not save calendar events', e)
    }
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
