import type { NotificationType, WebhookEvent } from '@/types'

// Misma lógica que el parser de notiback / vite-webhook-plugin.ts, para crear
// eventos en modo local (sin backend) con el mismo resultado.

const str = (raw: Record<string, unknown>, key: string) => (typeof raw[key] === 'string' ? (raw[key] as string) : '')

const firstString = (raw: Record<string, unknown>, ...keys: string[]) =>
  keys.map((k) => str(raw, k)).find(Boolean) ?? ''

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/

function detectType(raw: Record<string, unknown>): NotificationType {
  const value = ['type', 'level', 'status', 'severity']
    .map((k) => raw[k])
    .find((v) => v !== undefined && v !== null && v !== '' && v !== false)
  const rawType = value === undefined ? '' : String(value).toLowerCase()
  const has = (...subs: string[]) => subs.some((s) => rawType.includes(s))

  if (has('succ', 'ok', 'pass')) return 'success'
  if (has('warn', 'alert')) return 'warning'
  if (has('err', 'fail', 'crit')) return 'error'
  if (has('cal', 'meet', 'event') || (raw.date !== undefined && raw.date !== null && raw.date !== '')) return 'calendar'
  return 'info'
}

export function parseWebhookLocally(raw: Record<string, unknown>): WebhookEvent {
  const action = str(raw, 'action')
  const date = str(raw, 'date')
  const time = str(raw, 'time')
  return {
    id: 'wh_local_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
    title: firstString(raw, 'title', 'subject', 'event') || (action ? `Evento: ${action}` : 'Notificación de Webhook'),
    message: firstString(raw, 'message', 'description', 'text', 'content', 'details', 'summary') || JSON.stringify(raw),
    type: detectType(raw),
    source: firstString(raw, 'source', 'sender', 'app') || 'Simulador UI',
    timestamp: new Date().toISOString(),
    ...(DATE_RE.test(date) && { date }),
    ...(TIME_RE.test(time) && { time }),
    ...(str(raw, 'category') && { category: str(raw, 'category') }),
    read: false,
    rawPayload: raw,
  }
}
