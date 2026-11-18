import { AlertTriangle, Calendar, CheckCircle2, Radio, Webhook, XCircle, BellOff, VolumeX } from 'lucide-react'
import type { NotificationType, WebhookEvent } from '@/types'
import { STATUS } from '@/components/ui/status'
import { cn } from '@/lib/utils'

// Mismo aspecto que la tarjeta de la ventana de avisos (components/notify/NotifyApp.tsx)
const typeStyles: Record<NotificationType, { icon: typeof Webhook; text: string; stripe: string }> = {
  success: { icon: CheckCircle2, text: 'text-success', stripe: 'bg-success' },
  warning: { icon: AlertTriangle, text: 'text-warning', stripe: 'bg-warning' },
  error: { icon: XCircle, text: 'text-destructive', stripe: 'bg-destructive' },
  calendar: { icon: Calendar, text: 'text-primary', stripe: 'bg-primary' },
  info: { icon: Webhook, text: 'text-muted-foreground', stripe: 'bg-muted-foreground' },
}

/** Vista previa del aviso que mostrará un endpoint para un payload. */
export function NotificationPreview({
  event,
  source,
  popup,
  sound,
}: {
  event: WebhookEvent
  /** Origen mostrado (el nombre del endpoint si el payload no trae uno). */
  source: string
  popup: boolean
  sound: boolean
}) {
  const style = typeStyles[event.type] ?? typeStyles.info
  const Icon = style.icon

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'relative flex overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-[0_8px_24px_-8px_rgb(0_0_0/0.25)] transition-opacity',
          !popup && 'opacity-60'
        )}
      >
        <span className={cn('w-1 shrink-0', style.stripe)} aria-hidden />
        <div className="flex min-w-0 flex-1 gap-3 p-3.5">
          <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', style.text)} />
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="flex h-4 w-4 items-center justify-center rounded bg-primary text-primary-foreground">
                <Radio className="h-2.5 w-2.5" />
              </span>
              <span className="font-semibold text-foreground">PulseDesk</span>
              <span className="truncate">{source}</span>
              <span className="ml-auto shrink-0 font-mono">ahora</span>
            </div>
            <p className="truncate text-sm font-semibold leading-snug">{event.title}</p>
            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{event.message}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <Chip>
          <span className={cn('h-1.5 w-1.5 rounded-full', style.stripe)} />
          {STATUS[event.type].label}
        </Chip>
        {event.category && <Chip>{event.category}</Chip>}
        {(event.date || event.time) && (
          <Chip>
            <Calendar className="h-3 w-3" />
            {[event.date, event.time].filter(Boolean).join(' · ')}
          </Chip>
        )}
        {!popup && (
          <Chip muted>
            <BellOff className="h-3 w-3" />
            Solo historial
          </Chip>
        )}
        {!sound && popup && (
          <Chip muted>
            <VolumeX className="h-3 w-3" />
            Sin sonido
          </Chip>
        )}
      </div>
    </div>
  )
}

function Chip({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5',
        muted ? 'text-muted-foreground' : 'bg-card text-foreground'
      )}
    >
      {children}
    </span>
  )
}
