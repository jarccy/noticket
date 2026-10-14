import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import confetti from 'canvas-confetti'
import type { WebhookEvent, CalendarEvent, AppSettings } from '@/types'
import { Storage } from '@/services/storage'
import { dispatchDesktopNotification, requestNotificationPermission } from '@/services/notifications'
import { soundManager } from '@/services/sound'
import { applyAccent } from '@/lib/accent'

interface AppContextType {
  events: WebhookEvent[]
  calendarEvents: CalendarEvent[]
  settings: AppSettings
  unreadCount: number
  activeTab: 'dashboard' | 'calendar' | 'webhooks' | 'settings'
  setActiveTab: (tab: 'dashboard' | 'calendar' | 'webhooks' | 'settings') => void
  addWebhookEvent: (raw: Record<string, unknown>) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  clearEvents: () => void
  addCalendarEvent: (event: Omit<CalendarEvent, 'id'>) => void
  deleteCalendarEvent: (id: string) => void
  updateSettings: (newSettings: Partial<AppSettings>) => void
  isGatewayOnline: boolean
  triggerNotificationTest: () => void
  openSimulator: boolean
  setOpenSimulator: (open: boolean) => void
  toastQueue: WebhookEvent[]
  dismissToast: (id: string) => void
}

const AppContext = createContext<AppContextType | undefined>(undefined)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<WebhookEvent[]>(() => Storage.getEvents())
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(() => Storage.getCalendarEvents())
  const [settings, setSettings] = useState<AppSettings>(() => Storage.getSettings())
  const [activeTab, setActiveTab] = useState<'dashboard' | 'calendar' | 'webhooks' | 'settings'>('dashboard')
  const [isGatewayOnline, setIsGatewayOnline] = useState(false)
  const [openSimulator, setOpenSimulator] = useState(false)
  const [toastQueue, setToastQueue] = useState<WebhookEvent[]>([])

  // Apply sound setting
  useEffect(() => {
    soundManager.setEnabled(settings.soundEnabled)
  }, [settings.soundEnabled])

  // Apply dark mode class to html document
  useEffect(() => {
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [settings.theme])

  // Apply accent (primary) color
  useEffect(() => {
    applyAccent(settings.accentColor)
  }, [settings.accentColor])

  // Save to storage
  useEffect(() => {
    Storage.saveEvents(events)
  }, [events])

  useEffect(() => {
    Storage.saveCalendarEvents(calendarEvents)
  }, [calendarEvents])

  useEffect(() => {
    Storage.saveSettings(settings)
  }, [settings])

  const dismissToast = useCallback((id: string) => {
    setToastQueue((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // Process incoming event logic
  const handleIncomingEvent = useCallback(
    (event: WebhookEvent) => {
      // Add to events
      setEvents((prev) => [event, ...prev.filter((e) => e.id !== event.id)])

      // Add to toast queue
      setToastQueue((prev) => [event, ...prev.slice(0, 3)])
      setTimeout(() => {
        dismissToast(event.id)
      }, 6000)

      // Confetti for success
      if (event.type === 'success') {
        try {
          confetti({
            particleCount: 50,
            spread: 60,
            origin: { y: 0.8 },
          })
        } catch {
          // ignore
        }
      }

      // Desktop notification & sound
      if (settings.desktopNotificationsEnabled) {
        dispatchDesktopNotification(event.title, event.message, event.type)
      } else if (settings.soundEnabled) {
        soundManager.play(event.type)
      }

      // Auto-sync calendar if it contains date or is calendar type
      if (settings.autoCalendarSync && (event.date || event.type === 'calendar')) {
        const calDate = event.date || new Date().toISOString().split('T')[0]
        const newCalEvent: CalendarEvent = {
          id: 'cal_' + event.id,
          title: event.title,
          description: event.message,
          date: calDate,
          time: event.time || new Date().toTimeString().substring(0, 5),
          type: event.type,
          category: event.category || (event.type === 'calendar' ? 'Reunión' : 'Webhook'),
          source: event.source,
          webhookId: event.id,
        }
        setCalendarEvents((prev) => [newCalEvent, ...prev.filter((c) => c.webhookId !== event.id)])
      }
    },
    [settings, dismissToast]
  )

  // Listen to SSE `/api/events` from Vite backend
  useEffect(() => {
    let eventSource: EventSource | null = null
    let retryTimeout: ReturnType<typeof setTimeout>

    const connectSSE = () => {
      try {
        eventSource = new EventSource('/api/events')

        eventSource.onopen = () => {
          setIsGatewayOnline(true)
        }

        eventSource.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data)
            if (data.type === 'connected') {
              setIsGatewayOnline(true)
              return
            }
            if (data.id && data.title) {
              handleIncomingEvent(data as WebhookEvent)
            }
          } catch (err) {
            console.error('Error parsing SSE event', err)
          }
        }

        eventSource.onerror = () => {
          setIsGatewayOnline(false)
          eventSource?.close()
          retryTimeout = setTimeout(connectSSE, 4000)
        }
      } catch {
        setIsGatewayOnline(false)
      }
    }

    connectSSE()

    return () => {
      if (eventSource) eventSource.close()
      clearTimeout(retryTimeout)
    }
  }, [handleIncomingEvent])

  const addWebhookEvent = useCallback(
    async (raw: Record<string, unknown>) => {
      // Can be posted to local endpoint directly or added locally
      try {
        const res = await fetch('/api/webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(raw),
        })
        if (!res.ok) {
          throw new Error('Endpoint returned error')
        }
      } catch {
        // Fallback local simulated event if server offline
        const now = new Date()
        const id = 'wh_local_' + Date.now().toString(36)
        const event: WebhookEvent = {
          id,
          title: (raw.title as string) || (raw.event as string) || 'Notificación Local',
          message: (raw.message as string) || (raw.description as string) || JSON.stringify(raw),
          type: (raw.type as 'info') || 'info',
          source: (raw.source as string) || 'Simulador UI',
          timestamp: now.toISOString(),
          date: raw.date as string,
          time: raw.time as string,
          category: raw.category as string,
          read: false,
          rawPayload: raw,
        }
        handleIncomingEvent(event)
      }
    },
    [handleIncomingEvent]
  )

  const markAsRead = useCallback((id: string) => {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, read: true } : e)))
  }, [])

  const markAllAsRead = useCallback(() => {
    setEvents((prev) => prev.map((e) => ({ ...e, read: true })))
  }, [])

  const clearEvents = useCallback(() => {
    setEvents([])
  }, [])

  const addCalendarEvent = useCallback((event: Omit<CalendarEvent, 'id'>) => {
    const newEvent: CalendarEvent = {
      ...event,
      id: 'cal_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 5),
    }
    setCalendarEvents((prev) => [newEvent, ...prev])
  }, [])

  const deleteCalendarEvent = useCallback((id: string) => {
    setCalendarEvents((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const updateSettings = useCallback((newSettings: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }))
  }, [])

  const triggerNotificationTest = useCallback(async () => {
    const granted = await requestNotificationPermission()
    dispatchDesktopNotification(
      'Prueba de Notificación PulseDesk',
      'El sistema de notificaciones de escritorio y webhooks está funcionando al 100%.',
      'success'
    )
    if (!granted) {
      console.warn('Notification permission not granted in system')
    }
  }, [])

  const unreadCount = events.filter((e) => !e.read).length

  return (
    <AppContext.Provider
      value={{
        events,
        calendarEvents,
        settings,
        unreadCount,
        activeTab,
        setActiveTab,
        addWebhookEvent,
        markAsRead,
        markAllAsRead,
        clearEvents,
        addCalendarEvent,
        deleteCalendarEvent,
        updateSettings,
        isGatewayOnline,
        triggerNotificationTest,
        openSimulator,
        setOpenSimulator,
        toastQueue,
        dismissToast,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}
