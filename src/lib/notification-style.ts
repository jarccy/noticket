import {
  AlertOctagon,
  AlertTriangle,
  Bell,
  Calendar,
  CheckCircle2,
  Cloud,
  CreditCard,
  Database,
  Flame,
  GitBranch,
  Heart,
  Mail,
  MessageCircle,
  Package,
  Rocket,
  Server,
  Shield,
  ShoppingCart,
  Star,
  User,
  XCircle,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { NotificationAppearance, NotificationStyle, NotificationType } from '@/types'
import { readableOn } from '@/lib/accent'

/** Diseño por defecto: el aviso clásico de siempre. */
export const DEFAULT_APPEARANCE: NotificationAppearance = {
  style: 'classic',
  color: null,
  icon: null,
  duration: 6,
  showMeta: true,
}

export const STYLES: { id: NotificationStyle; label: string; description: string }[] = [
  { id: 'classic', label: 'Clásico', description: 'Franja de color, icono y detalle' },
  { id: 'compact', label: 'Compacto', description: 'Una sola línea, discreto' },
  { id: 'banner', label: 'Destacado', description: 'Cabecera de color, texto grande' },
  { id: 'solid', label: 'Sólido', description: 'Todo en color, imposible no verlo' },
  { id: 'minimal', label: 'Minimal', description: 'Solo texto, sin adornos' },
]

/** Galería de iconos que se pueden asignar a una conexión. */
export const ICONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'bell', label: 'Campana', icon: Bell },
  { id: 'rocket', label: 'Cohete', icon: Rocket },
  { id: 'zap', label: 'Rayo', icon: Zap },
  { id: 'shopping-cart', label: 'Pedido', icon: ShoppingCart },
  { id: 'credit-card', label: 'Pago', icon: CreditCard },
  { id: 'package', label: 'Envío', icon: Package },
  { id: 'server', label: 'Servidor', icon: Server },
  { id: 'database', label: 'Base de datos', icon: Database },
  { id: 'cloud', label: 'Nube', icon: Cloud },
  { id: 'git-branch', label: 'Código', icon: GitBranch },
  { id: 'shield', label: 'Seguridad', icon: Shield },
  { id: 'alert-octagon', label: 'Urgente', icon: AlertOctagon },
  { id: 'flame', label: 'Fuego', icon: Flame },
  { id: 'mail', label: 'Correo', icon: Mail },
  { id: 'message-circle', label: 'Mensaje', icon: MessageCircle },
  { id: 'user', label: 'Persona', icon: User },
  { id: 'heart', label: 'Corazón', icon: Heart },
  { id: 'star', label: 'Estrella', icon: Star },
]

/** Colores rápidos para elegir (también se admite cualquier otro). */
export const COLOR_SWATCHES = ['#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#d97706', '#16a34a', '#0d9488', '#475569']

export const DURATIONS: { seconds: number; label: string }[] = [
  { seconds: 4, label: '4 s' },
  { seconds: 6, label: '6 s' },
  { seconds: 10, label: '10 s' },
  { seconds: 20, label: '20 s' },
  { seconds: 0, label: 'Hasta cerrarlo' },
]

const TYPE_ICONS: Record<NotificationType, LucideIcon> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  calendar: Calendar,
  info: Bell,
}

/** Color del tipo como variable CSS: se adapta al tema claro / oscuro. */
const TYPE_VARS: Record<NotificationType, string> = {
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  error: 'var(--color-destructive)',
  calendar: 'var(--color-primary)',
  info: 'var(--color-muted-foreground)',
}

/** Para el diseño «Sólido» hace falta un color concreto (y un texto legible encima). */
const TYPE_SOLID: Record<NotificationType, string> = {
  success: '#15803d',
  warning: '#c2410c',
  error: '#b91c1c',
  calendar: '#1d4ed8',
  info: '#334155',
}

const HEX_RE = /^#[0-9a-f]{6}$/i
const STYLE_IDS = new Set(STYLES.map((s) => s.id))
const ICON_IDS = new Set(ICONS.map((i) => i.id))

/** Completa / corrige un diseño guardado (conexiones antiguas o datos parciales). */
export function normalizeAppearance(value: unknown): NotificationAppearance {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<NotificationAppearance>
  const duration = Number(v.duration)
  return {
    style: v.style && STYLE_IDS.has(v.style) ? v.style : DEFAULT_APPEARANCE.style,
    color: typeof v.color === 'string' && HEX_RE.test(v.color) ? v.color.toLowerCase() : null,
    icon: typeof v.icon === 'string' && ICON_IDS.has(v.icon) ? v.icon : null,
    duration: Number.isInteger(duration) && duration >= 0 && duration <= 120 ? duration : DEFAULT_APPEARANCE.duration,
    showMeta: typeof v.showMeta === 'boolean' ? v.showMeta : DEFAULT_APPEARANCE.showMeta,
  }
}

export interface ResolvedLook {
  appearance: NotificationAppearance
  Icon: LucideIcon
  /** Color de acento (variable CSS o hex) para franjas, iconos y cabeceras. */
  accent: string
  /** Fondo y texto del diseño «Sólido». */
  solidBg: string
  solidFg: string
}

export function resolveLook(type: NotificationType, appearance?: Partial<NotificationAppearance>): ResolvedLook {
  const a = normalizeAppearance(appearance)
  const Icon = (a.icon && ICONS.find((i) => i.id === a.icon)?.icon) || TYPE_ICONS[type] || Bell
  const solidBg = a.color ?? TYPE_SOLID[type] ?? TYPE_SOLID.info
  return {
    appearance: a,
    Icon,
    accent: a.color ?? TYPE_VARS[type] ?? TYPE_VARS.info,
    solidBg,
    solidFg: readableOn(solidBg),
  }
}
