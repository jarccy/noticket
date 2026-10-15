import type { CalendarEvent, WebhookEvent } from '@/types'

/**
 * Recordatorios de eventos del calendario: cuando llega la fecha y hora de un evento
 * se muestra un aviso. Solo los eventos con hora; los de "todo el día" no avisan.
 */

const STORAGE_KEY = 'noticket_reminded'
/** Si la app estaba cerrada, solo se avisa de lo que venció hace menos de esto. */
export const REMINDER_GRACE_MS = 15 * 60 * 1000
/** Cada cuánto se revisa el calendario. */
export const REMINDER_INTERVAL_MS = 15 * 1000

/** La clave incluye fecha y hora: si se edita el evento, el recordatorio se rearma. */
const reminderKey = (ev: CalendarEvent) => `${ev.id}|${ev.date}|${ev.time}`

export function dueTime(ev: CalendarEvent): number | null {
  if (!ev.time) return null
  const t = new Date(`${ev.date}T${ev.time}`).getTime()
  return Number.isNaN(t) ? null : t
}

function readReminded(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function writeReminded(keys: Set<string>) {
  try {
    // Solo se guardan las últimas para que no crezca sin límite
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys].slice(-500)))
  } catch {
    // sin almacenamiento: como mucho se repetiría un aviso
  }
}

export function markReminded(key: string) {
  const keys = readReminded()
  keys.add(key)
  writeReminded(keys)
}

/** Avisos aún no mostrados (futuros o vencidos hace poco), listos para el programador de Rust. */
export function pendingReminders(events: CalendarEvent[], now = Date.now()) {
  const keys = readReminded()
  return events.flatMap((ev) => {
    const due = dueTime(ev)
    const key = reminderKey(ev)
    if (due === null || now - due >= REMINDER_GRACE_MS || keys.has(key)) return []
    return [{ key, due, event: reminderNotification(ev) }]
  })
}

/** Evita avisar de un evento que se crea o edita con una hora que ya pasó. */
export function markRemindedIfPast(ev: CalendarEvent, now = Date.now()) {
  const due = dueTime(ev)
  if (due === null || due > now) return
  const keys = readReminded()
  keys.add(reminderKey(ev))
  writeReminded(keys)
}

/** Devuelve los eventos que vencieron y aún no se avisaron, y los marca como avisados. */
export function takeDueReminders(events: CalendarEvent[], now = Date.now()): CalendarEvent[] {
  const keys = readReminded()
  const due = events.filter((ev) => {
    const t = dueTime(ev)
    return t !== null && t <= now && now - t < REMINDER_GRACE_MS && !keys.has(reminderKey(ev))
  })
  if (due.length > 0) {
    due.forEach((ev) => keys.add(reminderKey(ev)))
    writeReminded(keys)
  }
  return due
}

/** El aviso usa la misma forma que un webhook para reutilizar el popup y los toasts. */
export function reminderNotification(ev: CalendarEvent): WebhookEvent {
  return {
    id: 'rem_' + ev.id + '_' + Date.now().toString(36),
    title: ev.title,
    message: [`${ev.time} · ${ev.category}`, ev.description].filter(Boolean).join(' — '),
    type: 'calendar',
    source: 'Recordatorio',
    timestamp: new Date().toISOString(),
    read: true,
    rawPayload: {},
    date: ev.date,
    time: ev.time,
  }
}
