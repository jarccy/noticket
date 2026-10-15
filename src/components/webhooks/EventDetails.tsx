import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowUpRight, CalendarDays, Check, Clock, Copy, ExternalLink, Code2, Radio, Tag } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { STATUS } from '@/components/ui/status'
import type { WebhookEvent } from '@/types'
import { cn } from '@/lib/utils'

/** Campos que ya se muestran arriba (título, mensaje, tipo…) o que son internos. */
const KNOWN_KEYS = new Set([
  'id', 'title', 'subject', 'event', 'message', 'description', 'text', 'body', 'type', 'status', 'level',
  'date', 'time', 'source', 'category', 'groupid', 'groupids', 'userids', 'secret', 'token',
])
const MAX_EXTRA = 10

type Extra = { label: string; value: string; href?: string }

function humanize(key: string): string {
  const s = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .trim()
    .toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatValue(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  if (typeof v === 'number') return v.toLocaleString('es')
  if (typeof v === 'string') return v
  if (Array.isArray(v)) {
    const items = v.map(formatValue).filter((x): x is string => x !== null && !x.startsWith('{'))
    return items.length ? items.join(', ') : `${v.length} elementos`
  }
  return null
}

/** Datos adicionales del payload en formato legible (un nivel de anidación). */
function extraFields(raw: Record<string, unknown>): Extra[] {
  const out: Extra[] = []
  const push = (label: string, v: unknown) => {
    const value = formatValue(v)
    if (value === null) return
    out.push({ label, value, href: /^https?:\/\/\S+$/.test(value) ? value : undefined })
  }
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (KNOWN_KEYS.has(k.toLowerCase())) continue
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) push(`${humanize(k)} · ${humanize(k2).toLowerCase()}`, v2)
    } else {
      push(humanize(k), v)
    }
  }
  return out
}

function Field({
  icon: Icon,
  label,
  className,
  children,
}: {
  icon: typeof Clock
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('flex min-w-0 items-start gap-2.5 rounded-lg bg-muted/50 px-3 py-2', className)}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <div className="truncate text-xs font-medium text-foreground">{children}</div>
      </div>
    </div>
  )
}

function eventText(e: WebhookEvent, extras: Extra[]): string {
  return [
    e.title,
    e.message,
    `Tipo: ${(STATUS[e.type] ?? STATUS.info).label}`,
    `Fuente: ${e.source}`,
    `Recibido: ${format(new Date(e.timestamp), "d MMM yyyy, HH:mm", { locale: es })}`,
    e.date && `Fecha: ${e.date}${e.time ? ' ' + e.time : ''}`,
    ...extras.map((x) => `${x.label}: ${x.value}`),
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Detalle de un webhook en formato amigable: tipo, fuente, fechas y datos adicionales.
 * `showJsonToggle` (admins) añade un botón para ver el payload crudo.
 */
export function EventDetails({
  event,
  showJsonToggle,
  json,
  actions,
}: {
  event: WebhookEvent
  showJsonToggle?: boolean
  json?: React.ReactNode
  actions?: React.ReactNode
}) {
  const { setActiveTab } = useApp()
  const [showJson, setShowJson] = useState(false)
  const [copied, setCopied] = useState(false)
  const s = STATUS[event.type] ?? STATUS.info
  const extras = extraFields(event.rawPayload)
  const visible = extras.slice(0, MAX_EXTRA)

  const copy = () => {
    navigator.clipboard.writeText(eventText(event, extras))
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  let when = ''
  if (event.date) {
    try {
      const d = format(parseISO(event.date), "EEEE d 'de' MMMM", { locale: es })
      when = d.charAt(0).toUpperCase() + d.slice(1) + (event.time ? ` · ${event.time}` : '')
    } catch {
      when = `${event.date} ${event.time ?? ''}`
    }
  }

  return (
    <div className="space-y-3">
      {event.message && <p className="text-sm leading-relaxed text-foreground">{event.message}</p>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field icon={Tag} label="Tipo">
          <span className={cn('inline-flex items-center gap-1', s.text)}>{s.label}</span>
        </Field>
        <Field icon={Radio} label="Fuente">
          {event.source || '—'}
        </Field>
        <Field icon={Clock} label="Recibido" className="col-span-2 sm:col-span-1">
          {format(new Date(event.timestamp), "d MMM yyyy, HH:mm", { locale: es })}
        </Field>
      </div>

      {when && (
        <button
          type="button"
          onClick={() => setActiveTab('calendar')}
          className="group flex w-full items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-left transition-colors hover:bg-primary/10"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarDays className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] text-muted-foreground">Agendado en tu calendario</span>
            <span className="block truncate text-sm font-medium text-foreground">{when}</span>
          </span>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
        </button>
      )}

      {visible.length > 0 && (
        <div className="rounded-lg border border-border">
          <p className="border-b border-border px-3 py-2 text-[11px] font-medium text-muted-foreground">Más información</p>
          <dl className="divide-y divide-border">
            {visible.map((x) => (
              <div key={x.label} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:gap-4">
                <dt className="shrink-0 text-xs text-muted-foreground sm:w-40">{x.label}</dt>
                <dd className="min-w-0 break-words text-xs font-medium text-foreground">
                  {x.href ? (
                    <a href={x.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                      <span className="break-all">{x.href}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  ) : (
                    x.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
          {extras.length > MAX_EXTRA && (
            <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
              y {extras.length - MAX_EXTRA} datos más
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copiado' : 'Copiar detalles'}
        </button>
        {actions}
        {showJsonToggle && (
          <button
            type="button"
            onClick={() => setShowJson((v) => !v)}
            aria-expanded={showJson}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors',
              showJson
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            <Code2 className="h-3.5 w-3.5" />
            {showJson ? 'Ocultar JSON' : 'Ver JSON'}
          </button>
        )}
      </div>

      {showJsonToggle && showJson && json}
    </div>
  )
}
