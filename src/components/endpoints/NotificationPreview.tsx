import { BellOff, Calendar, Repeat, VolumeX } from 'lucide-react'
import { repeatLabel } from '@/lib/repeats'
import type { NotificationAppearance, WebhookEvent } from '@/types'
import { STATUS } from '@/components/ui/status'
import { NotificationCard } from '@/components/notify/NotificationCard'
import { cn } from '@/lib/utils'

/** Vista previa del aviso que mostrará una conexión para un payload, con su diseño. */
export function NotificationPreview({
  event,
  source,
  popup,
  sound,
  repeatMinutes,
  appearance,
}: {
  event: WebhookEvent
  /** Origen mostrado (el nombre de la conexión si el payload no trae uno). */
  source: string
  popup: boolean
  sound: boolean
  /** Si se repite hasta marcarlo como visto. */
  repeatMinutes?: number
  appearance?: NotificationAppearance
}) {
  return (
    <div className="space-y-3">
      <NotificationCard
        event={{ ...event, source }}
        appearance={appearance}
        mode="preview"
        className={cn('transition-opacity', !popup && 'opacity-60')}
      />

      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <Chip>{STATUS[event.type].label}</Chip>
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
        {!!repeatMinutes && popup && (
          <Chip>
            <Repeat className="h-3 w-3" />
            Se repite {repeatLabel(repeatMinutes)}
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
