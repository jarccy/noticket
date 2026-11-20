import { useApp } from '@/context/AppContext'
import { NotificationCard } from '@/components/notify/NotificationCard'

/** Avisos dentro de la app (navegador, o con los avisos de escritorio desactivados). */
export function ToastContainer() {
  const { toastQueue, dismissToast, setActiveTab, events, markAsRead } = useApp()
  if (toastQueue.length === 0) return null
  const unseen = new Set(events.filter((e) => !e.read).map((e) => e.id))

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-full max-w-sm flex-col gap-2.5">
      {toastQueue.map((item) => (
        <NotificationCard
          key={item.id}
          event={item}
          className="pointer-events-auto"
          onDismiss={() => dismissToast(item.id)}
          onOpen={() => {
            setActiveTab(item.date || item.type === 'calendar' ? 'calendar' : 'webhooks')
            dismissToast(item.id)
          }}
          onSeen={
            unseen.has(item.id)
              ? () => {
                  markAsRead(item.id)
                  dismissToast(item.id)
                }
              : undefined
          }
        />
      ))}
    </div>
  )
}
