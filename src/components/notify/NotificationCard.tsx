import type { CSSProperties, ReactNode } from 'react'
import { Eye, Radio, Repeat, X } from 'lucide-react'
import type { NotificationAppearance, WebhookEvent } from '@/types'
import { resolveLook } from '@/lib/notification-style'
import { cn } from '@/lib/utils'

/** Los recordatorios del calendario y la prueba no son avisos del historial. */
const canMarkSeen = (event: WebhookEvent) => !event.id.startsWith('rem_') && !event.id.startsWith('test_')

/**
 * Tarjeta de aviso con el diseño de su conexión. La usan la ventana de avisos de escritorio,
 * los avisos dentro de la app (navegador) y la vista previa de la configuración.
 *
 * - `live`: cuenta atrás (se pausa al pasar el ratón) y se cierra sola al terminar, salvo
 *   duración 0 («hasta cerrarlo»).
 * - `preview`: estática, sin cuenta atrás.
 */
export function NotificationCard({
  event,
  appearance,
  mode = 'live',
  onDismiss,
  onOpen,
  onSeen,
  className,
}: {
  event: WebhookEvent
  /** Diseño a usar; por defecto el que trae el aviso. */
  appearance?: Partial<NotificationAppearance>
  mode?: 'live' | 'preview'
  onDismiss?: () => void
  onOpen?: () => void
  onSeen?: () => void
  className?: string
}) {
  const look = resolveLook(event.type, appearance ?? event.appearance)
  const { style, duration, showMeta } = look.appearance
  const Icon = look.Icon
  const time = new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const seenButton = onSeen && canMarkSeen(event)
  const solid = style === 'solid'

  const vars = {
    '--n-accent': look.accent,
    '--n-solid-bg': look.solidBg,
    '--n-solid-fg': look.solidFg,
    '--notify-duration': `${duration}s`,
  } as CSSProperties

  const meta = showMeta && (
    <span className={cn('flex min-w-0 items-center gap-1.5 text-[11px]', solid ? 'opacity-85' : 'text-muted-foreground')}>
      <span className="truncate">{event.source}</span>
      <span className="ml-auto shrink-0 font-mono">{time}</span>
    </span>
  )

  const repeatLine = !!event.repeatCount && (
    <p className={cn('flex items-center gap-1 text-[11px] font-medium', solid ? 'opacity-90' : 'text-warning')}>
      <Repeat className="h-3 w-3" />
      Sin ver · aviso n.º {event.repeatCount + 1}
    </p>
  )

  // Contenido según el diseño
  let body: ReactNode
  if (style === 'compact') {
    body = (
      <div className={cn('flex min-w-0 flex-1 items-center gap-2.5 py-2.5 pl-3', seenButton ? 'pr-16' : 'pr-9')}>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--n-accent)_16%,transparent)] text-[var(--n-accent)]">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <p className="min-w-0 flex-1 truncate text-sm">
          <span className="font-semibold">{event.title}</span>
          {event.message && <span className="text-muted-foreground"> · {event.message}</span>}
        </p>
        {showMeta && <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{time}</span>}
      </div>
    )
  } else if (style === 'banner') {
    body = (
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 bg-[var(--n-solid-bg)] bg-linear-to-r from-transparent to-black/15 px-3.5 py-2 pr-9 text-[var(--n-solid-fg)]">
          <Icon className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wider">
            {showMeta ? event.source : 'Aviso'}
          </span>
          {showMeta && <span className="shrink-0 font-mono text-[11px] opacity-90">{time}</span>}
        </div>
        <div className={cn('space-y-1 px-3.5 pt-2.5', seenButton ? 'pb-9' : 'pb-3.5')}>
          <p className="font-display text-base font-bold leading-snug">{event.title}</p>
          <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">{event.message}</p>
          {repeatLine}
        </div>
      </div>
    )
  } else if (style === 'solid') {
    body = (
      <div className={cn('flex min-w-0 flex-1 gap-3 p-3.5 pr-9', seenButton && 'pb-9')}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          {meta}
          <p className="text-sm font-bold leading-snug">{event.title}</p>
          <p className="line-clamp-2 text-xs leading-relaxed opacity-90">{event.message}</p>
          {repeatLine}
        </div>
      </div>
    )
  } else if (style === 'minimal') {
    body = (
      <div className={cn('min-w-0 flex-1 space-y-0.5 px-4 py-3 pr-9', seenButton && 'pb-9')}>
        {meta}
        <p className="flex items-center gap-2 text-sm font-medium leading-snug">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--n-accent)]" aria-hidden />
          <span className="truncate">{event.title}</span>
        </p>
        <p className="line-clamp-2 pl-3.5 text-xs leading-relaxed text-muted-foreground">{event.message}</p>
        {repeatLine}
      </div>
    )
  } else {
    // classic
    body = (
      <>
        <span className="w-1 shrink-0 bg-[var(--n-accent)]" aria-hidden />
        <div className={cn('flex min-w-0 flex-1 gap-3 p-3.5 pr-9', seenButton && 'pb-9')}>
          <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--n-accent)]" />
          <div className="min-w-0 flex-1 space-y-0.5">
            {showMeta && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary text-primary-foreground">
                  <Radio className="h-2.5 w-2.5" />
                </span>
                <span className="font-semibold text-foreground">PulseDesk</span>
                <span className="truncate">{event.source}</span>
                <span className="ml-auto shrink-0 font-mono">{time}</span>
              </div>
            )}
            <p className="truncate text-sm font-semibold leading-snug">{event.title}</p>
            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{event.message}</p>
            {repeatLine}
          </div>
        </div>
      </>
    )
  }

  const Content = onOpen ? 'button' : 'div'

  return (
    <div
      role="alert"
      style={vars}
      className={cn(
        'notify-card group relative flex overflow-hidden border shadow-[0_8px_24px_-6px_rgb(0_0_0/0.25)]',
        style === 'compact' ? 'rounded-2xl' : 'rounded-xl',
        solid
          ? 'border-transparent bg-[var(--n-solid-bg)] text-[var(--n-solid-fg)]'
          : 'border-border bg-card text-card-foreground',
        style === 'banner' && 'border-[color-mix(in_oklch,var(--n-solid-bg)_35%,var(--color-border))]',
        className
      )}
    >
      <Content
        {...(onOpen ? { type: 'button' as const, onClick: onOpen } : {})}
        className={cn('flex min-w-0 flex-1 text-left', onOpen && 'cursor-pointer')}
      >
        {body}
      </Content>

      {seenButton && style !== 'compact' && (
        <button
          type="button"
          onClick={onSeen}
          title="Marcar como visto: deja de repetirse"
          className={cn(
            'absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium transition-colors',
            solid
              ? 'border-white/30 bg-white/15 hover:bg-white/25'
              : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
          )}
        >
          <Eye className="h-3 w-3" />
          Visto
        </button>
      )}

      {seenButton && style === 'compact' && (
        <button
          type="button"
          onClick={onSeen}
          title="Marcar como visto: deja de repetirse"
          aria-label="Marcar como visto"
          className="absolute right-8 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
      )}

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar aviso"
          className={cn(
            'absolute right-2 rounded-md p-1 transition-colors',
            style === 'compact' ? 'top-1/2 -translate-y-1/2' : 'top-2',
            solid || style === 'banner'
              ? 'text-[var(--n-solid-fg)] opacity-85 hover:bg-white/15 hover:opacity-100'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          )}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Cuenta atrás: se pausa al pasar el ratón y cierra el aviso al terminar */}
      {mode === 'live' && duration > 0 && (
        <span
          className={cn(
            'notify-progress absolute bottom-0 left-0 right-0 h-0.5 origin-left',
            solid ? 'bg-white/60' : 'bg-[var(--n-accent)] opacity-70'
          )}
          onAnimationEnd={onDismiss}
          aria-hidden
        />
      )}
    </div>
  )
}
