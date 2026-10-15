import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import confetti from 'canvas-confetti'
import type { WebhookEvent, CalendarEvent, AppSettings } from '@/types'
import { Storage } from '@/services/storage'
import { Api, API_URL, AuthApi } from '@/services/api'
import { dispatchDesktopNotification, requestNotificationPermission } from '@/services/notifications'
import { soundManager } from '@/services/sound'
import { applyAccent } from '@/lib/accent'
import { isTauri } from '@/lib/platform'
import { parseWebhookLocally } from '@/lib/webhook-parser'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

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
  /** 'local': sin sesión, todo en este equipo. 'cloud': con sesión, todo en la base. */
  mode: DataMode
  /** Elementos del espacio local pendientes de subir (solo en modo 'cloud'). */
  pendingSync: number
  syncing: boolean
  syncLocalData: () => Promise<SyncResult>
}

export type DataMode = 'local' | 'cloud'

export interface SyncResult {
  uploaded: number
  failed: number
}

const AppContext = createContext<AppContextType | undefined>(undefined)

export function AppProvider({ mode, children }: { mode: DataMode; children: React.ReactNode }) {
  const cloud = mode === 'cloud'
  const [events, setEvents] = useState<WebhookEvent[]>(() => (cloud ? [] : Storage.getEvents()))
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(() => (cloud ? [] : Storage.getCalendarEvents()))
  const [pendingSync, setPendingSync] = useState(() => (cloud ? Storage.pendingCount() : 0))
  const [syncing, setSyncing] = useState(false)
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

  // Cloud: load persisted data from the Go backend (PostgreSQL)
  const loadFromServer = useCallback(async () => {
    const [dbEvents, dbCalendar, dbSettings] = await Promise.all([
      Api.getEvents(),
      Api.getCalendarEvents(),
      Api.getSettings(),
    ])
    setEvents(dbEvents)
    setCalendarEvents(dbCalendar)
    setSettings((prev) => ({ ...prev, ...dbSettings }))
  }, [])

  useEffect(() => {
    if (!cloud) return
    loadFromServer().catch((err) => console.warn('[api] no se pudieron cargar los datos del backend', err))
  }, [cloud, loadFromServer])

  // Local: everything lives in localStorage until it's synced
  useEffect(() => {
    if (!cloud) Storage.saveEvents(events)
  }, [cloud, events])

  useEffect(() => {
    if (!cloud) Storage.saveCalendarEvents(calendarEvents)
  }, [cloud, calendarEvents])

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
      if (cloud) Api.saveEvent(event)

      // Installed app: the app's own popup window (shows above other apps,
      // plays the sound itself). Browser / popup disabled: in-app toast.
      const usePopup = isTauri() && settings.desktopNotificationsEnabled
      if (usePopup) {
        invoke('show_notification', { event }).catch((err) => console.error('Popup failed', err))
      } else {
        setToastQueue((prev) => [event, ...prev.slice(0, 3)])
        setTimeout(() => {
          dismissToast(event.id)
        }, 6000)
      }

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
      if (usePopup) {
        // handled by the popup window
      } else if (settings.desktopNotificationsEnabled) {
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
        if (cloud) Api.saveCalendarEvent(newCalEvent)
      }
    },
    [cloud, settings, dismissToast]
  )

  // Installed app: webhooks arrive from the embedded Rust server as Tauri events
  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false
    const unlisteners: Promise<UnlistenFn>[] = [
      listen<WebhookEvent>('webhook', (e) => handleIncomingEvent(e.payload)),
      listen<boolean>('gateway-status', (e) => setIsGatewayOnline(e.payload)),
      listen<string>('navigate', (e) => setActiveTab(e.payload as AppContextType['activeTab'])),
    ]
    invoke<boolean>('gateway_online').then((online) => {
      if (!cancelled) setIsGatewayOnline(online)
    })
    return () => {
      cancelled = true
      unlisteners.forEach((p) => p.then((off) => off()))
    }
  }, [handleIncomingEvent])

  // Browser with a session: listen to SSE `/api/events` from the Go backend (notiback)
  useEffect(() => {
    if (isTauri() || !cloud) return
    let eventSource: EventSource | null = null
    let retryTimeout: ReturnType<typeof setTimeout>

    const connectSSE = () => {
      try {
        eventSource = new EventSource(AuthApi.eventsUrl())

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
  }, [cloud, handleIncomingEvent])

  const addWebhookEvent = useCallback(
    async (raw: Record<string, unknown>) => {
      // Installed app: same parser + event path as real webhooks
      if (isTauri()) {
        await invoke('ingest_webhook', { payload: raw })
        return
      }
      // Browser without a session: the event stays on this device
      if (!cloud) {
        handleIncomingEvent(parseWebhookLocally(raw))
        return
      }
      // Browser: post to the Go backend (it persists + broadcasts via SSE), fall back to a local event
      try {
        const res = await fetch(API_URL + '/webhook', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(settings.webhookSecret && { 'x-webhook-secret': settings.webhookSecret }),
          },
          body: JSON.stringify(raw),
        })
        if (!res.ok) {
          throw new Error('Endpoint returned error')
        }
      } catch {
        // Server offline: build the event here (handleIncomingEvent still tries to save it)
        handleIncomingEvent(parseWebhookLocally(raw))
      }
    },
    [cloud, handleIncomingEvent, settings.webhookSecret]
  )

  const markAsRead = useCallback(
    (id: string) => {
      setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, read: true } : e)))
      if (cloud) Api.markAsRead(id)
    },
    [cloud]
  )

  const markAllAsRead = useCallback(() => {
    setEvents((prev) => prev.map((e) => ({ ...e, read: true })))
    if (cloud) Api.markAllAsRead()
  }, [cloud])

  const clearEvents = useCallback(() => {
    setEvents([])
    if (cloud) Api.clearEvents()
  }, [cloud])

  const addCalendarEvent = useCallback(
    (event: Omit<CalendarEvent, 'id'>) => {
      const newEvent: CalendarEvent = {
        ...event,
        id: 'cal_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 5),
      }
      setCalendarEvents((prev) => [newEvent, ...prev])
      if (cloud) Api.saveCalendarEvent(newEvent)
    },
    [cloud]
  )

  const deleteCalendarEvent = useCallback(
    (id: string) => {
      setCalendarEvents((prev) => prev.filter((c) => c.id !== id))
      if (cloud) Api.deleteCalendarEvent(id)
    },
    [cloud]
  )

  const updateSettings = useCallback(
    (newSettings: Partial<AppSettings>) => {
      setSettings((prev) => ({ ...prev, ...newSettings }))
      if (cloud) Api.saveSettings(newSettings)
    },
    [cloud]
  )

  /**
   * Sube a la base lo creado sin sesión (webhooks primero, luego el calendario, que puede
   * apuntar a ellos). Lo que se sube se quita del espacio local; lo que falla se queda
   * pendiente para el siguiente intento.
   */
  const syncLocalData = useCallback(async (): Promise<SyncResult> => {
    setSyncing(true)
    try {
      const uploadedEvents = new Set<string>()
      const uploadedCalendar = new Set<string>()
      let failed = 0

      for (const event of Storage.getEvents()) {
        try {
          await Api.uploadEvent(event)
          uploadedEvents.add(event.id)
        } catch (err) {
          failed++
          console.warn('[sync] webhook no subido', event.id, err)
        }
      }

      // Un evento de calendario solo puede enlazar un webhook que exista en la base
      const knownWebhooks = new Set([...uploadedEvents, ...events.map((e) => e.id)])
      for (const cal of Storage.getCalendarEvents()) {
        const payload = cal.webhookId && !knownWebhooks.has(cal.webhookId) ? { ...cal, webhookId: undefined } : cal
        try {
          await Api.uploadCalendarEvent(payload)
          uploadedCalendar.add(cal.id)
        } catch (err) {
          failed++
          console.warn('[sync] evento de calendario no subido', cal.id, err)
        }
      }

      Storage.removeEvents(uploadedEvents)
      Storage.removeCalendarEvents(uploadedCalendar)
      setPendingSync(Storage.pendingCount())
      await loadFromServer().catch((err) => console.warn('[sync] no se pudo recargar', err))
      return { uploaded: uploadedEvents.size + uploadedCalendar.size, failed }
    } finally {
      setSyncing(false)
    }
  }, [events, loadFromServer])

  const triggerNotificationTest = useCallback(async () => {
    if (isTauri()) {
      const testEvent: WebhookEvent = {
        id: 'test_' + Date.now().toString(36),
        title: 'Prueba de notificación',
        message: 'Así se verán los webhooks entrantes. Haz clic para abrir la app.',
        type: 'success',
        source: 'PulseDesk',
        timestamp: new Date().toISOString(),
        read: true,
        rawPayload: {},
      }
      await invoke('show_notification', { event: testEvent })
      return
    }
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
        mode,
        pendingSync,
        syncing,
        syncLocalData,
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
