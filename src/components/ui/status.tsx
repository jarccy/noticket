import { CircleCheck, TriangleAlert, CircleX, CalendarDays, Info, type LucideIcon } from 'lucide-react'
import { formatDistanceToNowStrict } from 'date-fns'
import { es } from 'date-fns/locale'
import type { NotificationType } from '@/types'
import { cn } from '@/lib/utils'

export const STATUS: Record<NotificationType, { label: string; icon: LucideIcon; text: string; bg: string }> = {
  success: { label: 'Éxito', icon: CircleCheck, text: 'text-success', bg: 'bg-success/10' },
  warning: { label: 'Alerta', icon: TriangleAlert, text: 'text-warning', bg: 'bg-warning/10' },
  error: { label: 'Error', icon: CircleX, text: 'text-destructive', bg: 'bg-destructive/10' },
  calendar: { label: 'Calendario', icon: CalendarDays, text: 'text-primary', bg: 'bg-primary/10' },
  info: { label: 'Info', icon: Info, text: 'text-muted-foreground', bg: 'bg-muted' },
}

export const TYPE_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'success', label: 'Éxitos' },
  { id: 'warning', label: 'Alertas' },
  { id: 'error', label: 'Errores' },
  { id: 'calendar', label: 'Calendario' },
] as const

export type TypeFilter = (typeof TYPE_FILTERS)[number]['id']

export function StatusIcon({ type, className }: { type: NotificationType; className?: string }) {
  const s = STATUS[type] ?? STATUS.info
  const Icon = s.icon
  return (
    <span
      className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', s.bg, s.text, className)}
      title={s.label}
    >
      <Icon className="h-4 w-4" />
    </span>
  )
}

export function relativeTime(iso: string): string {
  try {
    return formatDistanceToNowStrict(new Date(iso), { addSuffix: true, locale: es })
  } catch {
    return iso
  }
}

export function clockTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return iso
  }
}
