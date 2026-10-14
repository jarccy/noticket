import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { X, CheckCircle2, AlertTriangle, XCircle, Calendar, Webhook, Radio } from 'lucide-react'
import type { NotificationType, WebhookEvent } from '@/types'
import { Storage } from '@/services/storage'
import { soundManager } from '@/services/sound'
import { applyAccent } from '@/lib/accent'

const MAX_VISIBLE = 3
const DURATION_MS = 6000

const typeStyles: Record<NotificationType, { icon: typeof Webhook; text: string; stripe: string }> = {
  success: { icon: CheckCircle2, text: 'text-success', stripe: 'bg-success' },
  warning: { icon: AlertTriangle, text: 'text-warning', stripe: 'bg-warning' },
  error: { icon: XCircle, text: 'text-destructive', stripe: 'bg-destructive' },
  calendar: { icon: Calendar, text: 'text-primary', stripe: 'bg-primary' },
  info: { icon: Webhook, text: 'text-muted-foreground', stripe: 'bg-muted-foreground' },
}

/** Theme + accent come from the same localStorage the main window writes. */
function applyStoredAppearance() {
  const settings = Storage.getSettings()
  document.documentElement.classList.toggle('dark', settings.theme === 'dark')
  applyAccent(settings.accentColor)
  soundManager.setEnabled(settings.soundEnabled)
}

function NotificationCard({
  event,
  onDismiss,
  onOpen,
}: {
  event: WebhookEvent
  onDismiss: () => void
  onOpen: () => void
}) {
  const style = typeStyles[event.type] ?? typeStyles.info
  const Icon = style.icon
  const time = new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div
      role="alert"
      className="notify-card group relative flex overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-[0_8px_24px_-6px_rgb(0_0_0/0.25)]"
    >
      <span className={`w-1 shrink-0 ${style.stripe}`} aria-hidden />

      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 gap-3 p-3.5 pr-9 text-left cursor-pointer">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${style.text}`} />
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="flex h-4 w-4 items-center justify-center rounded bg-primary text-primary-foreground">
              <Radio className="h-2.5 w-2.5" />
            </span>
            <span className="font-semibold text-foreground">PulseDesk</span>
            <span className="truncate">{event.source}</span>
            <span className="ml-auto shrink-0 font-mono">{time}</span>
          </div>
          <p className="truncate text-sm font-semibold leading-snug">{event.title}</p>
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{event.message}</p>
        </div>
      </button>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Cerrar notificación"
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Countdown: pauses on hover, dismisses when the animation ends */}
      <span
        className="notify-progress absolute bottom-0 left-1 right-0 h-0.5 origin-left bg-primary/70"
        style={{ animationDuration: `${DURATION_MS}ms` }}
        onAnimationEnd={onDismiss}
        aria-hidden
      />
    </div>
  )
}

export function NotifyApp() {
  const [items, setItems] = useState<WebhookEvent[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.documentElement.classList.add('notify-window')
    applyStoredAppearance()
    const onStorage = () => applyStoredAppearance()
    window.addEventListener('storage', onStorage)

    const unlisten = listen<WebhookEvent>('notify:push', (e) => {
      applyStoredAppearance()
      soundManager.play(e.payload.type)
      setItems((prev) => [e.payload, ...prev.filter((p) => p.id !== e.payload.id)].slice(0, MAX_VISIBLE))
    })

    return () => {
      window.removeEventListener('storage', onStorage)
      unlisten.then((off) => off())
    }
  }, [])

  // Keep the native window exactly as tall as the stack; 0 hides it.
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const report = () => {
      const height = items.length === 0 ? 0 : Math.ceil(el.getBoundingClientRect().height)
      invoke('layout_notifications', { height }).catch(() => {})
    }
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [items.length])

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const open = useCallback(
    (event: WebhookEvent) => {
      const tab = event.date || event.type === 'calendar' ? 'calendar' : 'webhooks'
      invoke('open_main', { tab }).catch(() => {})
      dismiss(event.id)
    },
    [dismiss]
  )

  return (
    <div ref={containerRef} className="flex flex-col gap-2 p-2">
      {items.map((item) => (
        <NotificationCard
          key={item.id}
          event={item}
          onDismiss={() => dismiss(item.id)}
          onOpen={() => open(item)}
        />
      ))}
    </div>
  )
}
