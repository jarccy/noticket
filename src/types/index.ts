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
  /** Endpoint configurado por el que llegó (ausente: /webhook genérico o creado en la app). */
  endpointId?: string
  /** Preferencias del endpoint para este aviso: false desactiva el popup / el sonido. */
  popup?: boolean
  sound?: boolean
  /** En una repetición (aviso aún no visto): cuántas veces se ha mostrado. */
  repeatCount?: number
  /** Diseño del aviso según su conexión (no se guarda: viaja con el aviso). */
  appearance?: Partial<NotificationAppearance>
}

/** Diseños de aviso que se pueden elegir en cada conexión. */
export type NotificationStyle = 'classic' | 'compact' | 'banner' | 'solid' | 'minimal'

/** Cómo se ve el aviso de una conexión. */
export interface NotificationAppearance {
  style: NotificationStyle
  /** '#rrggbb', o null para usar el color del tipo de aviso (éxito, alerta…). */
  color: string | null
  /** Id de un icono de la galería, o null para el icono del tipo de aviso. */
  icon: string | null
  /** Segundos en pantalla; 0 = hasta que se cierre. */
  duration: number
  /** Mostrar el origen y la hora. */
  showMeta: boolean
}

/** Campos del evento que un endpoint puede mapear desde el payload. */
export type MappedField = 'title' | 'message' | 'type' | 'source' | 'date' | 'time' | 'category'

/**
 * Cada campo es una ruta del payload (`pull_request.title`, `commits.0.message`) o una
 * plantilla con `{{ruta}}` (`PR #{{number}}: {{pull_request.title}}`).
 */
export type FieldMapping = Partial<Record<MappedField, string>>

/** Webhook configurado: recibe en `/webhook/{id}` con su secreto, mapeo y preferencias. */
export interface WebhookEndpoint {
  id: string
  name: string
  description: string
  secret: string
  enabled: boolean
  popup: boolean
  sound: boolean
  mapping: FieldMapping
  /** Repetir el aviso cada `repeatMinutes` mientras no se marque como visto. */
  repeat: boolean
  repeatMinutes: number
  /** Diseño de sus avisos. */
  appearance: NotificationAppearance
  receivedCount: number
  lastReceivedAt?: string
  createdAt: string
  updatedAt: string
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

export type AppTab = 'dashboard' | 'calendar' | 'webhooks' | 'endpoints' | 'groups' | 'settings'

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
