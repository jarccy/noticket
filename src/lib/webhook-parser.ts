import type { FieldMapping, NotificationType, WebhookEvent } from '@/types'

// Misma lógica que el parser de notiback (internal/webhook/parser.go) y el de Tauri
// (src-tauri/src/webhook.rs), para crear eventos en modo local y previsualizar el mapeo
// de un endpoint con el mismo resultado.

const str = (raw: Record<string, unknown>, key: string) => (typeof raw[key] === 'string' ? (raw[key] as string) : '')

const firstString = (raw: Record<string, unknown>, ...keys: string[]) =>
  keys.map((k) => str(raw, k)).find(Boolean) ?? ''

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/

function rawTypeOf(raw: Record<string, unknown>): string {
  const value = ['type', 'level', 'status', 'severity']
    .map((k) => raw[k])
    .find((v) => v !== undefined && v !== null && v !== '' && v !== false)
  return value === undefined ? '' : String(value)
}

function detectType(rawType: string, hasDate: boolean): NotificationType {
  const t = rawType.toLowerCase()
  const has = (...subs: string[]) => subs.some((s) => t.includes(s))
  if (has('succ', 'ok', 'pass')) return 'success'
  if (has('warn', 'alert')) return 'warning'
  if (has('err', 'fail', 'crit')) return 'error'
  if (has('cal', 'meet', 'event') || hasDate) return 'calendar'
  return 'info'
}

/** Recorre el payload por una ruta con puntos; los índices de lista son números. */
export function resolvePath(payload: unknown, path: string): unknown {
  let cur: unknown = payload
  for (const key of path.trim().split('.').filter(Boolean)) {
    if (Array.isArray(cur)) {
      cur = /^\d+$/.test(key) ? cur[Number(key)] : undefined
    } else if (cur && typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[key]
    } else {
      return undefined
    }
    if (cur === undefined) return undefined
  }
  return cur
}

function valueText(v: unknown): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

/** Evalúa un campo mapeado: plantilla si contiene `{{`, si no una ruta. */
export function renderMapping(spec: string | undefined, payload: unknown): string {
  const s = spec?.trim()
  if (!s) return ''
  if (!s.includes('{{')) return valueText(resolvePath(payload, s)).trim()
  return s.replace(/\{\{([^}]*)\}\}/g, (_, path: string) => valueText(resolvePath(payload, path))).trim()
}

export function parseWebhookLocally(raw: Record<string, unknown>, mapping?: FieldMapping): WebhookEvent {
  const m = (field: keyof FieldMapping) => renderMapping(mapping?.[field], raw)
  const action = str(raw, 'action')
  const date = m('date') || str(raw, 'date')
  const time = m('time') || str(raw, 'time')
  const validDate = DATE_RE.test(date)
  const hasDate = validDate || (raw.date !== undefined && raw.date !== null && raw.date !== '')
  const category = m('category') || str(raw, 'category')
  return {
    id: 'wh_local_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
    title:
      m('title') || firstString(raw, 'title', 'subject', 'event') || (action ? `Evento: ${action}` : 'Notificación de Webhook'),
    message:
      m('message') || firstString(raw, 'message', 'description', 'text', 'content', 'details', 'summary') || JSON.stringify(raw),
    type: detectType(m('type') || rawTypeOf(raw), hasDate),
    source: m('source') || firstString(raw, 'source', 'sender', 'app') || 'Simulador UI',
    timestamp: new Date().toISOString(),
    ...(validDate && { date }),
    ...(TIME_RE.test(time) && { time }),
    ...(category && { category }),
    read: false,
    rawPayload: raw,
  }
}
