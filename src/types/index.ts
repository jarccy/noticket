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

export type AppTab = 'dashboard' | 'calendar' | 'webhooks' | 'groups' | 'settings'

/** Rol en notiback. admin: ve todo · boss: crea grupos · user: solo lo suyo */
export type UserType = 'admin' | 'boss' | 'user'

export interface UserSummary {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  userType: UserType
}

export interface GroupMember extends UserSummary {
  addedAt: string
}

export interface Group {
  id: string
  name: string
  description: string
  ownerId: string
  ownerName: string
  memberCount: number
  createdAt: string
  members?: GroupMember[]
}
