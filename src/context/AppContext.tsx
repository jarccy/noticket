import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import confetti from 'canvas-confetti'
import type { WebhookEvent, WebhookEndpoint, CalendarEvent, AppSettings, AppTab } from '@/types'
import { Storage } from '@/services/storage'
import { Api, API_URL, ApiError, AuthApi, EndpointsApi, type EndpointInput } from '@/services/api'
import { localStore, newEndpointId, newEndpointSecret } from '@/services/localStore'
import { dispatchDesktopNotification, requestNotificationPermission } from '@/services/notifications'
import { soundManager } from '@/services/sound'
import { applyAccent } from '@/lib/accent'
import { isTauri } from '@/lib/platform'
import { parseWebhookLocally } from '@/lib/webhook-parser'
import {
  REMINDER_INTERVAL_MS,
  markReminded,
  markRemindedIfPast,
  pendingReminders,
  reminderNotification,
  takeDueReminders,
} from '@/lib/reminders'
import { applyAutostartDefault } from '@/lib/autostart'
import { pendingRepeats, takeDueRepeats } from '@/lib/repeats'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

interface AppContextType {
  events: WebhookEvent[]
  calendarEvents: CalendarEvent[]
  settings: AppSettings
  unreadCount: number
  activeTab: AppTab
  setActiveTab: (tab: AppTab) => void
  addWebhookEvent: (raw: Record<string, unknown>) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  clearEvents: () => void
  /** Borra los webhooks indicados del historial. */
  deleteEvents: (ids: string[]) => void
  addCalendarEvent: (event: Omit<CalendarEvent, 'id'>) => void
  updateCalendarEvent: (id: string, changes: Partial<Omit<CalendarEvent, 'id'>>) => void
  deleteCalendarEvent: (id: string) => void
  deleteCalendarEvents: (ids: string[]) => void
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
  /** Endpoints configurados (SQLite sin sesión, backend con sesión). */
  endpoints: WebhookEndpoint[]
  /** false en el navegador sin sesión: no hay servidor que reciba los webhooks. */
  endpointsAvailable: boolean
  createEndpoint: (data: EndpointData) => Promise<WebhookEndpoint>
  updateEndpoint: (id: string, changes: Partial<EndpointData>) => Promise<WebhookEndpoint>
  rotateEndpointSecret: (id: string) => Promise<WebhookEndpoint>
  deleteEndpoint: (id: string) => Promise<void>
}

/** Lo que el usuario edita de un endpoint (id, secreto y contadores los gestiona la app). */
export type EndpointData = Pick<
  WebhookEndpoint,
  'name' | 'description' | 'enabled' | 'popup' | 'sound' | 'mapping' | 'repeat' | 'repeatMinutes'
>

export type DataMode = 'local' | 'cloud'

export interface SyncResult {
  uploaded: number
  failed: number
}

const AppContext = createContext<AppContextType | undefined>(undefined)

/** Escrituras locales: no bloquean la UI; si fallan queda constancia en la consola. */
function persistLocal(p: Promise<unknown>) {
  p.catch((err) => console.warn('[local] no se pudo guardar en el espacio local', err))
}

/** `primary` (lo cargado) más lo de `extra` que no esté en él (lo llegado mientras cargaba). */
function mergeById<T extends { id: string }>(primary: T[], extra: T[]): T[] {
  const ids = new Set(primary.map((x) => x.id))
  return [...extra.filter((x) => !ids.has(x.id)), ...primary]
}

export function AppProvider({ mode, children }: { mode: DataMode; children: React.ReactNode }) {
  const cloud = mode === 'cloud'
  const [events, setEvents] = useState<WebhookEvent[]>([])
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([])
  const [pendingSync, setPendingSync] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [settings, setSettings] = useState<AppSettings>(() => Storage.getSettings())
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard')
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
    setEvents((prev) => mergeById(dbEvents, prev))
    setCalendarEvents(dbCalendar)
    setSettings((prev) => ({ ...prev, ...dbSettings }))
    setEndpoints(await EndpointsApi.list().catch(() => []))
  }, [])

  // Initial load. Cloud: from the backend. Local: from SQLite (desktop) or localStorage (browser).
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      // Desktop: first run with SQLite imports what older versions kept in localStorage
      await localStore.init().catch((err) => console.warn('[local] no se pudo migrar el espacio local', err))
      if (cloud) {
        await loadFromServer().catch((err) => console.warn('[api] no se pudieron cargar los datos del backend', err))
        const pending = await localStore.pendingCount().catch(() => 0)
        if (!cancelled) setPendingSync(pending)
        return
      }
      const [localEvents, localCalendar, localEndpoints] = await Promise.all([
        localStore.listEvents(),
        localStore.listCalendar(),
        localStore.listEndpoints(),
      ])
      if (cancelled) return
      // Something may have arrived while loading: keep it
      setEvents((prev) => mergeById(localEvents, prev))
      setCalendarEvents((prev) => mergeById(localCalendar, prev))
      setEndpoints(localEndpoints)
    }
    load().catch((err) => console.warn('[local] no se pudieron cargar los datos locales', err))
    return () => {
      cancelled = true
    }
  }, [cloud, loadFromServer])

  useEffect(() => {
    Storage.saveSettings(settings)
  }, [settings])

  const dismissToast = useCallback((id: string) => {
    setToastQueue((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // Show a notification (webhook or calendar reminder) through the right channel
  const notify = useCallback(
    (event: WebhookEvent) => {
      // Installed app: the app's own popup window (shows above other apps,
      // plays the sound itself). Browser / popup disabled: in-app toast.
      const usePopup = isTauri() && settings.desktopNotificationsEnabled
      if (usePopup) {
        invoke('show_notification', { event }).catch((err) => console.error('Popup failed', err))
        return
      }
      setToastQueue((prev) => [event, ...prev.slice(0, 3)])
      setTimeout(() => {
        dismissToast(event.id)
      }, 6000)

      // An endpoint can mute its own notifications
      const withSound = event.sound !== false
      if (settings.desktopNotificationsEnabled) {
        dispatchDesktopNotification(event.title, event.message, event.type, withSound)
      } else if (settings.soundEnabled && withSound) {
        soundManager.play(event.type)
      }
    },
    [settings.desktopNotificationsEnabled, settings.soundEnabled, dismissToast]
  )

  // Process incoming event logic. origin: 'rust' = local Tauri server or in-app ingest,
  // 'server' = backend SSE (already stored there), 'local' = built in the browser.
  const handleIncomingEvent = useCallback(
    (event: WebhookEvent, origin: 'rust' | 'server' | 'local' = 'local') => {
      // Add to events. Rust already stored its own events in SQLite (local mode)
      setEvents((prev) => [event, ...prev.filter((e) => e.id !== event.id)])
      if (cloud && origin !== 'server') Api.saveEvent(event)
      if (!cloud && origin !== 'rust') persistLocal(localStore.saveEvent(event))

      if (event.endpointId) {
        setEndpoints((prev) =>
          prev.map((ep) =>
            ep.id === event.endpointId
              ? { ...ep, receivedCount: ep.receivedCount + 1, lastReceivedAt: event.timestamp }
              : ep
          )
        )
      }

      // Installed app with popups on: Rust already showed its own events (works with the window hidden).
      // An endpoint with popup off only records the event.
      const shownByRust = origin === 'rust' && isTauri() && settings.desktopNotificationsEnabled
      if (!shownByRust && event.popup !== false) notify(event)

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

      // Auto-sync calendar if it contains date or is calendar type
      if (settings.autoCalendarSync && (event.date || event.type === 'calendar')) {
        const calDate = event.date || new Date().toISOString().split('T')[0]
        const newCalEvent: CalendarEvent = {
          id: 'cal_' + event.id,
          title: event.title,
          description: event.message,
          date: calDate,
          // Con fecha pero sin hora = todo el día; sin fecha = ocurre ahora
          time: event.time || (event.date ? undefined : new Date().toTimeString().substring(0, 5)),
          type: event.type,
          category: event.category || (event.type === 'calendar' ? 'Reunión' : 'Webhook'),
          source: event.source,
          webhookId: event.id,
        }
        // Si ya es la hora, el popup del webhook ya avisó: no repetir con un recordatorio
        markRemindedIfPast(newCalEvent)
        setCalendarEvents((prev) => [newCalEvent, ...prev.filter((c) => c.webhookId !== event.id)])
        if (cloud) Api.saveCalendarEvent(newCalEvent)
        else persistLocal(localStore.saveCalendar(newCalEvent))
      }
    },
    [cloud, settings.autoCalendarSync, settings.desktopNotificationsEnabled, notify]
  )

  // Installed app: Rust pushes the popups, so it needs to know the setting
  useEffect(() => {
    if (isTauri()) invoke('set_popups_enabled', { enabled: settings.desktopNotificationsEnabled }).catch(() => {})
  }, [settings.desktopNotificationsEnabled])

  // Calendar reminders: notify when an event's date and time arrive
  useEffect(() => {
    // Installed app with popups: Rust schedules them so they fire even from the tray
    if (isTauri() && settings.desktopNotificationsEnabled) {
      invoke('set_reminders', { reminders: pendingReminders(calendarEvents) }).catch((err) =>
        console.error('No se pudieron programar los recordatorios', err)
      )
      return
    }
    if (isTauri()) invoke('set_reminders', { reminders: [] }).catch(() => {})
    const check = () => takeDueReminders(calendarEvents).forEach((ev) => notify(reminderNotification(ev)))
    check()
    const timer = setInterval(check, REMINDER_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [calendarEvents, settings.desktopNotificationsEnabled, notify])

  // Repeating notifications: unseen webhooks from endpoints with "repeat" on come back
  // every N minutes until they are marked as seen
  const repeating = useMemo(() => pendingRepeats(events, endpoints), [events, endpoints])
  useEffect(() => {
    // Installed app with popups: Rust schedules them so they fire even from the tray
    if (isTauri() && settings.desktopNotificationsEnabled) {
      invoke('set_repeats', { repeats: repeating }).catch((err) =>
        console.error('No se pudieron programar las repeticiones', err)
      )
      return
    }
    if (isTauri()) invoke('set_repeats', { repeats: [] }).catch(() => {})
    if (repeating.length === 0) return
    const check = () => takeDueRepeats(repeating).forEach((ev) => notify(ev))
    const timer = setInterval(check, 15_000)
    return () => clearInterval(timer)
  }, [repeating, settings.desktopNotificationsEnabled, notify])

  // Installed app: webhooks arrive from the embedded Rust server as Tauri events
  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false
    const unlisteners: Promise<UnlistenFn>[] = [
      listen<WebhookEvent>('webhook', (e) => handleIncomingEvent(e.payload, 'rust')),
      listen<boolean>('gateway-status', (e) => setIsGatewayOnline(e.payload)),
      listen<string>('navigate', (e) => setActiveTab(e.payload as AppContextType['activeTab'])),
      listen<string>('reminder-fired', (e) => markReminded(e.payload)),
      // "Marcar como visto" from the popup: Rust already stopped the repetitions (and,
      // in local mode, saved it in SQLite)
      listen<string>('event-seen', (e) => {
        setEvents((prev) => prev.map((ev) => (ev.id === e.payload ? { ...ev, read: true } : ev)))
        if (cloud) Api.markAsRead(e.payload)
      }),
    ]
    invoke<boolean>('gateway_online').then((online) => {
      if (!cancelled) setIsGatewayOnline(online)
    })
    return () => {
      cancelled = true
      unlisteners.forEach((p) => p.then((off) => off()))
    }
  }, [cloud, handleIncomingEvent])

  // Installed app: start with Windows by default (once; the user can turn it off in Ajustes)
  useEffect(() => {
    applyAutostartDefault()
  }, [])

  // Without a session the local Tauri server runs in local mode: it accepts webhooks
  // from this machine, and from other devices only with the local secret
  useEffect(() => {
    if (!isTauri()) return
    invoke('set_session_active', { active: cloud }).catch(() => {})
    invoke('set_local_webhook_secret', { secret: Storage.getLocalWebhookSecret() }).catch(() => {})
  }, [cloud])

  // With a session (browser or desktop): listen to SSE `/api/events` from the Go backend
  // (notiback) — webhooks sent to this user's secret and notifications from their groups
  useEffect(() => {
    if (!cloud) return
    // Desktop: the gateway indicator reflects the local Rust server, not this stream
    const setOnline = (online: boolean) => {
      if (!isTauri()) setIsGatewayOnline(online)
    }
    let eventSource: EventSource | null = null
    let retryTimeout: ReturnType<typeof setTimeout>

    const connectSSE = () => {
      try {
        eventSource = new EventSource(AuthApi.eventsUrl())

        eventSource.onopen = () => {
          setOnline(true)
        }

        eventSource.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data)
            if (data.type === 'connected') {
              setOnline(true)
              return
            }
            if (data.id && data.title) {
              handleIncomingEvent(data as WebhookEvent, 'server')
            }
          } catch (err) {
            console.error('Error parsing SSE event', err)
          }
        }

        eventSource.onerror = () => {
          setOnline(false)
          eventSource?.close()
          retryTimeout = setTimeout(connectSSE, 4000)
        }
      } catch {
        setOnline(false)
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
      else persistLocal(localStore.markRead([id]))
    },
    [cloud]
  )

  const markAllAsRead = useCallback(() => {
    setEvents((prev) => prev.map((e) => ({ ...e, read: true })))
    if (cloud) Api.markAllAsRead()
    else persistLocal(localStore.markAllRead())
  }, [cloud])

  const clearEvents = useCallback(() => {
    setEvents([])
    if (cloud) Api.clearEvents()
    else persistLocal(localStore.clearEvents())
  }, [cloud])

  const deleteEvents = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return
      const set = new Set(ids)
      setEvents((prev) => prev.filter((e) => !set.has(e.id)))
      if (cloud) Api.deleteEvents(ids)
      else persistLocal(localStore.deleteEvents(ids))
    },
    [cloud]
  )

  const addCalendarEvent = useCallback(
    (event: Omit<CalendarEvent, 'id'>) => {
      const newEvent: CalendarEvent = {
        ...event,
        id: 'cal_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 5),
      }
      markRemindedIfPast(newEvent)
      setCalendarEvents((prev) => [newEvent, ...prev])
      if (cloud) Api.saveCalendarEvent(newEvent)
      else persistLocal(localStore.saveCalendar(newEvent))
    },
    [cloud]
  )

  const updateCalendarEvent = useCallback(
    (id: string, changes: Partial<Omit<CalendarEvent, 'id'>>) => {
      const current = calendarEvents.find((c) => c.id === id)
      if (!current) return
      const updated: CalendarEvent = { ...current, ...changes }
      markRemindedIfPast(updated)
      setCalendarEvents((prev) => prev.map((c) => (c.id === id ? updated : c)))
      if (cloud) Api.saveCalendarEvent(updated)
      else persistLocal(localStore.saveCalendar(updated))
    },
    [cloud, calendarEvents]
  )

  const deleteCalendarEvent = useCallback(
    (id: string) => {
      setCalendarEvents((prev) => prev.filter((c) => c.id !== id))
      if (cloud) Api.deleteCalendarEvent(id)
      else persistLocal(localStore.deleteCalendar([id]))
    },
    [cloud]
  )

  const deleteCalendarEvents = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return
      const set = new Set(ids)
      setCalendarEvents((prev) => prev.filter((c) => !set.has(c.id)))
      if (cloud) Api.deleteCalendarEvents(ids)
      else persistLocal(localStore.deleteCalendar(ids))
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
   * Sube a la base lo creado sin sesión: primero los endpoints (los webhooks pueden
   * apuntarlos, y conservan id y secreto para que sus URLs sigan valiendo), luego los
   * webhooks y por último el calendario (que puede apuntar a ellos). Lo que se sube se
   * quita del espacio local; lo que falla se queda pendiente para el siguiente intento.
   */
  const syncLocalData = useCallback(async (): Promise<SyncResult> => {
    setSyncing(true)
    try {
      const uploadedEndpoints: string[] = []
      const uploadedEvents: string[] = []
      const uploadedCalendar: string[] = []
      let failed = 0

      const serverEndpoints = new Set((await EndpointsApi.list().catch(() => [])).map((ep) => ep.id))
      for (const ep of await localStore.listEndpoints()) {
        try {
          if (!serverEndpoints.has(ep.id)) {
            await EndpointsApi.create({
              id: ep.id,
              name: ep.name,
              description: ep.description,
              secret: ep.secret,
              enabled: ep.enabled,
              popup: ep.popup,
              sound: ep.sound,
              mapping: ep.mapping,
              repeat: ep.repeat,
              repeatMinutes: ep.repeatMinutes,
            })
          }
          uploadedEndpoints.push(ep.id)
        } catch (err) {
          failed++
          console.warn('[sync] endpoint no subido', ep.id, err)
        }
      }

      for (const event of await localStore.listEvents()) {
        try {
          await Api.uploadEvent(event)
          uploadedEvents.push(event.id)
        } catch (err) {
          failed++
          console.warn('[sync] webhook no subido', event.id, err)
        }
      }

      // Un evento de calendario solo puede enlazar un webhook que exista en la base
      const knownWebhooks = new Set([...uploadedEvents, ...events.map((e) => e.id)])
      for (const cal of await localStore.listCalendar()) {
        const payload = cal.webhookId && !knownWebhooks.has(cal.webhookId) ? { ...cal, webhookId: undefined } : cal
        try {
          await Api.uploadCalendarEvent(payload)
          uploadedCalendar.push(cal.id)
        } catch (err) {
          failed++
          console.warn('[sync] evento de calendario no subido', cal.id, err)
        }
      }

      await Promise.all([
        localStore.deleteEndpoints(uploadedEndpoints),
        localStore.deleteEvents(uploadedEvents),
        localStore.deleteCalendar(uploadedCalendar),
      ])
      setPendingSync(await localStore.pendingCount().catch(() => 0))
      await loadFromServer().catch((err) => console.warn('[sync] no se pudo recargar', err))
      return { uploaded: uploadedEndpoints.length + uploadedEvents.length + uploadedCalendar.length, failed }
    } finally {
      setSyncing(false)
    }
  }, [events, loadFromServer])

  // ---------- Endpoints ----------

  const endpointsAvailable = cloud || localStore.supportsEndpoints

  const storeEndpoint = useCallback((saved: WebhookEndpoint) => {
    setEndpoints((prev) =>
      prev.some((ep) => ep.id === saved.id) ? prev.map((ep) => (ep.id === saved.id ? saved : ep)) : [...prev, saved]
    )
    return saved
  }, [])

  const createEndpoint = useCallback(
    async (data: EndpointData) => {
      if (cloud) return storeEndpoint(await EndpointsApi.create(data))
      const now = new Date().toISOString()
      return storeEndpoint(
        await localStore.saveEndpoint({
          ...data,
          id: newEndpointId(),
          secret: newEndpointSecret(),
          receivedCount: 0,
          createdAt: now,
          updatedAt: now,
        })
      )
    },
    [cloud, storeEndpoint]
  )

  const updateEndpoint = useCallback(
    async (id: string, changes: Partial<EndpointData>) => {
      if (cloud) return storeEndpoint(await EndpointsApi.update(id, changes as EndpointInput))
      const current = endpoints.find((ep) => ep.id === id)
      if (!current) throw new Error('Endpoint no encontrado')
      return storeEndpoint(await localStore.saveEndpoint({ ...current, ...changes }))
    },
    [cloud, endpoints, storeEndpoint]
  )

  const rotateEndpointSecret = useCallback(
    async (id: string) => {
      if (cloud) return storeEndpoint(await EndpointsApi.rotateSecret(id))
      const current = endpoints.find((ep) => ep.id === id)
      if (!current) throw new Error('Endpoint no encontrado')
      return storeEndpoint(await localStore.saveEndpoint({ ...current, secret: newEndpointSecret() }))
    },
    [cloud, endpoints, storeEndpoint]
  )

  const deleteEndpoint = useCallback(
    async (id: string) => {
      if (cloud) {
        try {
          await EndpointsApi.remove(id)
        } catch (err) {
          // Ya no existía en la base: basta con quitarlo de la lista
          if (!(err instanceof ApiError && err.status === 404)) throw err
        }
      } else {
        await localStore.deleteEndpoints([id])
      }
      setEndpoints((prev) => prev.filter((ep) => ep.id !== id))
    },
    [cloud]
  )

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
        deleteEvents,
        addCalendarEvent,
        updateCalendarEvent,
        deleteCalendarEvent,
        deleteCalendarEvents,
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
        endpoints,
        endpointsAvailable,
        createEndpoint,
        updateEndpoint,
        rotateEndpointSecret,
        deleteEndpoint,
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
