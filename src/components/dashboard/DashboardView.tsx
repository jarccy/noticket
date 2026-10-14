import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowUpRight, ChevronDown, Inbox, Zap } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { PageHeader } from '@/components/ui/page-header'
import { Segmented } from '@/components/ui/segmented'
import { StatusIcon, TYPE_FILTERS, relativeTime, clockTime, type TypeFilter } from '@/components/ui/status'
import { CodeBlock, CopyButton, useCopy } from '@/components/ui/payload-block'
import type { NotificationType } from '@/types'
import { cn } from '@/lib/utils'

type Preset = 'deploy' | 'alert' | 'calendar' | 'payment'

const PRESETS: { id: Preset; label: string; hint: string; type: NotificationType }[] = [
  { id: 'deploy', label: 'CI/CD Deploy', hint: 'GitHub Actions', type: 'success' },
  { id: 'alert', label: 'Alerta de servidor', hint: 'Prometheus', type: 'warning' },
  { id: 'calendar', label: 'Agendar reunión', hint: 'Google Calendar', type: 'calendar' },
  { id: 'payment', label: 'Pago recibido', hint: 'Stripe', type: 'info' },
]

function Metric({
  label,
  value,
  hint,
  hintClass,
  onClick,
}: {
  label: string
  value: string | number
  hint: string
  hintClass?: string
  onClick?: () => void
}) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      onClick={onClick}
      className={cn(
        'group flex flex-col gap-1 bg-card p-5 text-left',
        onClick && 'cursor-pointer transition-colors hover:bg-accent/50'
      )}
    >
      <span className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        {label}
        {onClick && <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />}
      </span>
      <span className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">{value}</span>
      <span className={cn('text-xs text-muted-foreground', hintClass)}>{hint}</span>
    </Comp>
  )
}

export function DashboardView() {
  const { events, calendarEvents, unreadCount, addWebhookEvent, setActiveTab } = useApp()
  const [filterType, setFilterType] = useState<TypeFilter>('all')
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null)
  const { copiedKey, copy } = useCopy()

  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const todayCalendarCount = calendarEvents.filter((c) => c.date === todayStr).length
  const alertCount = events.filter((e) => e.type === 'warning' || e.type === 'error').length
  const successCount = events.filter((e) => e.type === 'success').length
  const successRate = events.length > 0 ? Math.round((successCount / events.length) * 100) : 100

  const upcoming = calendarEvents
    .filter((c) => c.date >= todayStr)
    .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
    .slice(0, 4)

  const filteredEvents = events.filter((e) => filterType === 'all' || e.type === filterType)

  // Quick preset triggers
  const sendPreset = (type: Preset) => {
    if (type === 'deploy') {
      addWebhookEvent({
        title: 'Despliegue a Producción Exitoso',
        message: 'Versión v' + Math.floor(Math.random() * 5 + 1) + '.' + Math.floor(Math.random() * 10) + '.0 completada con éxito en Kubernetes.',
        type: 'success',
        source: 'GitHub Actions',
        environment: 'production',
        commit: 'a' + Math.random().toString(36).substring(2, 8),
      })
    } else if (type === 'alert') {
      addWebhookEvent({
        title: 'Alerta de Carga: CPU > 85%',
        message: 'El servidor worker-' + Math.floor(Math.random() * 8 + 1) + ' ha superado el 85% de utilización.',
        type: 'warning',
        source: 'Prometheus',
        threshold: '85%',
        metric: 'cpu_usage',
      })
    } else if (type === 'calendar') {
      const tomorrow = format(new Date(Date.now() + 86400000), 'yyyy-MM-dd')
      addWebhookEvent({
        title: 'Reunión de Retrospectiva de Sprint',
        message: 'Sesión quincenal de feedback y mejoras del equipo técnico.',
        type: 'calendar',
        date: tomorrow,
        time: '15:30',
        category: 'Reunión',
        source: 'Google Calendar API',
      })
    } else if (type === 'payment') {
      addWebhookEvent({
        title: 'Nueva Suscripción Activada',
        message: 'Cliente Startup Pro activó el plan Enterprise anual por $4,800 USD.',
        type: 'success',
        source: 'Stripe',
        amount: 4800,
        currency: 'USD',
      })
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Webhooks entrantes, alertas y próximos eventos en tiempo real."
      />

      {/* Metrics strip */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4">
        <Metric label="Webhooks" value={events.length} hint={unreadCount > 0 ? `${unreadCount} sin leer` : 'Todo leído'} onClick={() => setActiveTab('webhooks')} />
        <Metric label="Eventos hoy" value={todayCalendarCount} hint={`${calendarEvents.length} agendados en total`} onClick={() => setActiveTab('calendar')} />
        <Metric
          label="Alertas"
          value={alertCount}
          hint={alertCount > 0 ? 'Requieren atención' : 'Todo en orden'}
          hintClass={alertCount > 0 ? 'text-warning' : 'text-success'}
        />
        <Metric label="Tasa de éxito" value={`${successRate}%`} hint={`${successCount} eventos exitosos`} />
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Activity */}
        <section className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">Actividad reciente</h2>
            <Segmented
              ariaLabel="Filtrar por tipo"
              value={filterType}
              onChange={setFilterType}
              options={TYPE_FILTERS.map((f) => ({ id: f.id, label: f.label }))}
            />
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {filteredEvents.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
                <Inbox className="h-6 w-6 text-muted-foreground/50" />
                <p className="text-sm font-medium text-foreground">Sin actividad para este filtro</p>
                <p className="text-xs text-muted-foreground">Envía un webhook o usa una simulación rápida.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filteredEvents.slice(0, 8).map((event) => {
                  const isExpanded = expandedEventId === event.id
                  return (
                    <li key={event.id}>
                      <button
                        type="button"
                        onClick={() => setExpandedEventId(isExpanded ? null : event.id)}
                        aria-expanded={isExpanded}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
                      >
                        <StatusIcon type={event.type} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{event.title}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {event.source} · {relativeTime(event.timestamp)}
                          </p>
                        </div>
                        {!event.read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" title="No leído" />}
                        <ChevronDown
                          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', isExpanded && 'rotate-180')}
                        />
                      </button>
                      {isExpanded && (
                        <div className="space-y-3 px-4 pb-4 pl-[60px]">
                          <p className="text-sm leading-relaxed text-muted-foreground">{event.message}</p>
                          <CodeBlock
                            label={`payload · ${clockTime(event.timestamp)}`}
                            maxHeight="max-h-48"
                            actions={
                              <CopyButton
                                copied={copiedKey === event.id}
                                onClick={() => copy(event.id, JSON.stringify(event.rawPayload, null, 2))}
                              />
                            }
                          >
                            {JSON.stringify(event.rawPayload, null, 2)}
                          </CodeBlock>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            {filteredEvents.length > 8 && (
              <button
                type="button"
                onClick={() => setActiveTab('webhooks')}
                className="flex w-full items-center justify-center gap-1 border-t border-border py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
              >
                Ver los {filteredEvents.length} eventos
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </section>

        {/* Side column */}
        <aside className="space-y-8">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Próximos eventos</h2>
              <button
                type="button"
                onClick={() => setActiveTab('calendar')}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Calendario
              </button>
            </div>
            {upcoming.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
                No hay eventos próximos.
              </p>
            ) : (
              <ul className="space-y-1">
                {upcoming.map((ev) => {
                  const d = parseISO(ev.date)
                  return (
                    <li key={ev.id}>
                      <button
                        type="button"
                        onClick={() => setActiveTab('calendar')}
                        className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-accent/50"
                      >
                        <span className="flex w-10 shrink-0 flex-col items-center rounded-lg border border-border bg-card py-1">
                          <span className="text-[10px] font-medium uppercase leading-none text-muted-foreground">
                            {format(d, 'MMM', { locale: es }).replace('.', '')}
                          </span>
                          <span className="text-base font-semibold leading-tight tabular-nums text-foreground">
                            {format(d, 'd')}
                          </span>
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-foreground">{ev.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {ev.time ?? 'Todo el día'} · {ev.category}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Zap className="h-3.5 w-3.5 text-muted-foreground" />
              Simulación rápida
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => sendPreset(p.id)}
                  className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-foreground/20 hover:bg-accent/40 active:scale-[0.98]"
                >
                  <StatusIcon type={p.type} className="h-7 w-7" />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-foreground">{p.label}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{p.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
