export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'calendar'

export interface WebhookEvent {
  id: string
  title: string
  message: string
  type: NotificationType
  source: string
  timestamp: string
  date?: string
  time?: string
  category?: string
  read: boolean
  rawPayload: Record<string, unknown>
}

export interface CalendarEvent {
  id: string
  title: string
  description?: string
  date: string // YYYY-MM-DD
  time?: string // HH:mm
  type: NotificationType
  category: string
  source?: string
  webhookId?: string
}

export interface AppSettings {
  soundEnabled: boolean
  desktopNotificationsEnabled: boolean
  autoCalendarSync: boolean
  webhookSecret: string
  theme: 'dark' | 'light'
  /** 'mono' (black/white), a preset id from lib/accent, or a custom '#rrggbb' */
  accentColor: string
  /** Last custom color picked, kept so it survives switching to a preset */
  customAccent: string
}
