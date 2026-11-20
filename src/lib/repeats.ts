import type { WebhookEndpoint, WebhookEvent } from '@/types'

/**
 * Avisos que se repiten: un webhook no visto de un endpoint con «Repetir aviso» vuelve a
 * mostrarse cada N minutos hasta que se marca como visto. En la app de escritorio los
 * programa Rust (src-tauri/src/repeats.rs); en el navegador, o con los popups
 * desactivados, `takeDueRepeats` hace lo mismo con toasts.
 */
export interface PendingRepeat {
  id: string
  everyMs: number
  /** Llegada del evento: las repeticiones caen en since + k·every. */
  sinceMs: number
  event: WebhookEvent
}

/** Como mucho se programan los más recientes (la lista de eventos ya va de nuevo a viejo). */
const MAX_REPEATS = 200

export function pendingRepeats(events: WebhookEvent[], endpoints: WebhookEndpoint[]): PendingRepeat[] {
  const repeating = new Map(endpoints.filter((ep) => ep.repeat && ep.popup).map((ep) => [ep.id, ep]))
  if (repeating.size === 0) return []
  const out: PendingRepeat[] = []
  for (const event of events) {
    if (event.read || !event.endpointId) continue
    const ep = repeating.get(event.endpointId)
    const sinceMs = Date.parse(event.timestamp)
    if (!ep || Number.isNaN(sinceMs)) continue
    out.push({
      id: event.id,
      everyMs: ep.repeatMinutes * 60_000,
      sinceMs,
      // La configuración actual del endpoint manda (p. ej. si se silenció después)
      event: { ...event, popup: true, sound: ep.sound, appearance: ep.appearance },
    })
    if (out.length >= MAX_REPEATS) break
  }
  return out
}

/** Primer hueco después de `now` y su número de repetición. */
function nextSlot(since: number, every: number, now: number): [number, number] {
  if (now <= since) return [since + every, 1]
  const k = Math.floor((now - since) / every) + 1
  return [since + k * every, k]
}

// Estado del programador en JS (fuera de React para que sobreviva a los renders)
const scheduled = new Map<string, { key: string; due: number; count: number }>()

/** Devuelve los avisos que toca repetir ahora (con `repeatCount`) y avanza su siguiente hueco. */
export function takeDueRepeats(list: PendingRepeat[], now = Date.now()): WebhookEvent[] {
  const due: WebhookEvent[] = []
  const alive = new Set<string>()
  for (const r of list) {
    alive.add(r.id)
    const key = `${r.everyMs}|${r.sinceMs}`
    let s = scheduled.get(r.id)
    if (!s || s.key !== key) {
      const [slot, k] = nextSlot(r.sinceMs, r.everyMs, now)
      s = { key, due: slot, count: k - 1 }
      scheduled.set(r.id, s)
    }
    if (s.due <= now) {
      s.count += 1
      s.due = nextSlot(r.sinceMs, r.everyMs, now)[0]
      due.push({ ...r.event, repeatCount: s.count })
    }
  }
  for (const id of scheduled.keys()) if (!alive.has(id)) scheduled.delete(id)
  return due
}

/** Intervalos que se ofrecen en la configuración (minutos). */
export const REPEAT_PRESETS = [5, 15, 30, 60]
export const REPEAT_MIN = 1
export const REPEAT_MAX = 1440

export const validRepeatMinutes = (m: number) => Number.isInteger(m) && m >= REPEAT_MIN && m <= REPEAT_MAX

/** «cada 15 min», «cada 2 h», «cada 1 h 30 min». */
export function repeatLabel(minutes: number): string {
  if (minutes < 60) return `cada ${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `cada ${h} h ${m} min` : `cada ${h} h`
}
