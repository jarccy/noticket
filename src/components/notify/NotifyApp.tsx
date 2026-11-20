import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { WebhookEvent } from '@/types'
import { NotificationCard } from '@/components/notify/NotificationCard'
import { Storage } from '@/services/storage'
import { soundManager } from '@/services/sound'
import { applyAccent } from '@/lib/accent'

const MAX_VISIBLE = 3
/** Theme + accent come from the same localStorage the main window writes. */
function applyStoredAppearance() {
  const settings = Storage.getSettings()
  document.documentElement.classList.toggle('dark', settings.theme === 'dark')
  applyAccent(settings.accentColor)
  soundManager.setEnabled(settings.soundEnabled)
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
      // Un endpoint puede silenciar sus avisos
      if (e.payload.sound !== false) soundManager.play(e.payload.type)
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

  // Marca el webhook como leído y detiene sus repeticiones (Rust avisa a la ventana principal)
  const seen = useCallback(
    (id: string) => {
      invoke('mark_seen', { id }).catch(() => {})
      dismiss(id)
    },
    [dismiss]
  )

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
          onSeen={() => seen(item.id)}
        />
      ))}
    </div>
  )
}
