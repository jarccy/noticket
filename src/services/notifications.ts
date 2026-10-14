import { soundManager } from './sound'

export interface WebhookNotification {
  id: string
  title: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error' | 'calendar'
  source: string
  timestamp: string
  rawPayload: Record<string, unknown>
  read: boolean
  calendarEventId?: string
}

export async function requestNotificationPermission(): Promise<boolean> {
  // Check Tauri
  try {
    const tauriNotification = await import('@tauri-apps/plugin-notification')
    let granted = await tauriNotification.isPermissionGranted()
    if (!granted) {
      const permission = await tauriNotification.requestPermission()
      granted = permission === 'granted'
    }
    return granted
  } catch {
    // Fallback to browser Notification API
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') return true
      if (Notification.permission !== 'denied') {
        const perm = await Notification.requestPermission()
        return perm === 'granted'
      }
    }
    return false
  }
}

export async function dispatchDesktopNotification(
  title: string,
  body: string,
  type: 'info' | 'success' | 'warning' | 'error' | 'calendar' = 'info'
) {
  // Play sound
  soundManager.play(type)

  // 1. Try Tauri notification
  try {
    const tauriNotification = await import('@tauri-apps/plugin-notification')
    const granted = await tauriNotification.isPermissionGranted()
    if (granted) {
      tauriNotification.sendNotification({
        title,
        body,
      })
      return
    }
  } catch {
    // Tauri not available, continue to browser
  }

  // 2. Try Web Notification API
  try {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(title, {
          body,
          icon: '/favicon.ico',
        })
      }
    }
  } catch (e) {
    console.warn('Desktop notification failed:', e)
  }
}
