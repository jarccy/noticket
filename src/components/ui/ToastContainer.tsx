import { X, CheckCircle2, AlertTriangle, XCircle, Calendar, Webhook } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import type { NotificationType } from '@/types'

export function ToastContainer() {
  const { toastQueue, dismissToast, setActiveTab } = useApp()

  if (toastQueue.length === 0) return null

  const getToastIcon = (type: NotificationType) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
      case 'error':
        return <XCircle className="h-5 w-5 text-destructive shrink-0" />
      case 'calendar':
        return <Calendar className="h-5 w-5 text-primary shrink-0" />
      default:
        return <Webhook className="h-5 w-5 text-primary shrink-0" />
    }
  }

  const getBorderColor = (type: NotificationType) => {
    switch (type) {
      case 'success':
        return 'border-l-success'
      case 'warning':
        return 'border-l-warning'
      case 'error':
        return 'border-l-destructive'
      case 'calendar':
        return 'border-l-primary'
      default:
        return 'border-l-foreground/40'
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      {toastQueue.map((item) => (
        <div
          key={item.id}
          className={`pointer-events-auto rounded-xl border border-border border-l-4 bg-card p-4 shadow-lg transition-all duration-300 animate-in slide-in-from-bottom-5 ${getBorderColor(
            item.type
          )}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              {getToastIcon(item.type)}
              <div
                className="space-y-1 cursor-pointer"
                onClick={() => {
                  setActiveTab(item.date || item.type === 'calendar' ? 'calendar' : 'webhooks')
                  dismissToast(item.id)
                }}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.2 rounded">
                    {item.source}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <h5 className="text-sm font-semibold text-foreground leading-tight">{item.title}</h5>
                <p className="text-xs text-muted-foreground line-clamp-2">{item.message}</p>
              </div>
            </div>

            <button
              onClick={() => dismissToast(item.id)}
              className="text-muted-foreground hover:text-foreground transition-colors p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
