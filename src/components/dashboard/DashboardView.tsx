import { useState } from 'react'
import {
  Webhook,
  Calendar,
  AlertTriangle,
  Activity,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Send,
  Code2,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Zap,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { WebhookEvent, NotificationType } from '@/types'

export function DashboardView() {
  const { events, calendarEvents, addWebhookEvent, setOpenSimulator, setActiveTab } = useApp()
  const [filterType, setFilterType] = useState<string>('all')
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const todayStr = new Date().toISOString().split('T')[0]
  const todayCalendarCount = calendarEvents.filter((c) => c.date === todayStr).length
  const alertCount = events.filter((e) => e.type === 'warning' || e.type === 'error').length
  const successCount = events.filter((e) => e.type === 'success').length
  const successRate = events.length > 0 ? Math.round((successCount / events.length) * 100) : 100

  // Quick preset triggers
  const sendPreset = (type: 'deploy' | 'alert' | 'calendar' | 'payment') => {
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
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
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

  const copyPayload = (id: string, payload: Record<string, unknown>) => {
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const filteredEvents = events.filter((event) => {
    if (filterType === 'all') return true
    return event.type === filterType
  })

  const getBadgeVariant = (type: NotificationType) => {
    switch (type) {
      case 'success':
        return 'success'
      case 'warning':
        return 'warning'
      case 'error':
        return 'destructive'
      case 'calendar':
        return 'default'
      default:
        return 'secondary'
    }
  }

  const formatTimestamp = (iso: string) => {
    try {
      const date = new Date(iso)
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    } catch {
      return iso
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard General</h1>
          <p className="text-sm text-muted-foreground">
            Monitoreo en tiempo real de webhooks entrantes, notificaciones activas y eventos programados.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => setOpenSimulator(true)}
            className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Send className="h-4 w-4" />
            <span>Enviar Webhook JSON</span>
          </Button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Stat 1: Total Webhooks */}
        <Card className="relative overflow-hidden border-border/80 hover:border-foreground/20 transition-all duration-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Webhooks</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center text-foreground">
              <Webhook className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold tracking-tight text-foreground">{events.length}</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <span className="text-success font-semibold flex items-center">
                <ArrowUpRight className="h-3 w-3" /> En Vivo
              </span>
              <span>vía SSE & HTTP</span>
            </p>
          </CardContent>
        </Card>

        {/* Stat 2: Calendar Events Today */}
        <Card
          onClick={() => setActiveTab('calendar')}
          className="relative overflow-hidden border-border/80 hover:border-foreground/20 transition-all duration-200 cursor-pointer group"
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Eventos Hoy</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center text-foreground group-hover:scale-110 transition-transform">
              <Calendar className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold tracking-tight text-foreground">{todayCalendarCount}</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <span>{calendarEvents.length} eventos totales agendados</span>
            </p>
          </CardContent>
        </Card>

        {/* Stat 3: Alerts / Warnings */}
        <Card className="relative overflow-hidden border-border/80 hover:border-foreground/20 transition-all duration-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Alertas Críticas</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center text-foreground">
              <AlertTriangle className="h-4 w-4 text-warning" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold tracking-tight text-foreground">{alertCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className={alertCount > 0 ? 'text-warning font-medium' : 'text-success font-medium'}>
                {alertCount > 0 ? 'Requieren atención' : 'Todo en orden'}
              </span>
            </p>
          </CardContent>
        </Card>

        {/* Stat 4: Success Rate */}
        <Card className="relative overflow-hidden border-border/80 hover:border-foreground/20 transition-all duration-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tasa de Éxito</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center text-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold tracking-tight text-foreground">{successRate}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              <span>{successCount} eventos satisfactorios</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Action Presets */}
      <Card className="border-border/80">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-semibold">Simular Webhooks con 1 Clic</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Prueba instantáneamente el receptor de payloads JSON, los sonidos y las notificaciones de escritorio.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <button
              onClick={() => sendPreset('deploy')}
              className="flex items-center justify-center gap-2 p-2.5 rounded-lg border border-border bg-card hover:bg-accent text-foreground text-xs font-medium transition-all"
            >
              <CheckCircle2 className="h-4 w-4 text-success" />
              <span>CI/CD Deploy</span>
            </button>
            <button
              onClick={() => sendPreset('alert')}
              className="flex items-center justify-center gap-2 p-2.5 rounded-lg border border-border bg-card hover:bg-accent text-foreground text-xs font-medium transition-all"
            >
              <AlertTriangle className="h-4 w-4 text-warning" />
              <span>Alerta Servidor</span>
            </button>
            <button
              onClick={() => sendPreset('calendar')}
              className="flex items-center justify-center gap-2 p-2.5 rounded-lg border border-border bg-card hover:bg-accent text-foreground text-xs font-medium transition-all"
            >
              <Calendar className="h-4 w-4" />
              <span>Agendar Reunión</span>
            </button>
            <button
              onClick={() => sendPreset('payment')}
              className="flex items-center justify-center gap-2 p-2.5 rounded-lg border border-border bg-card hover:bg-accent text-foreground text-xs font-medium transition-all"
            >
              <Activity className="h-4 w-4" />
              <span>Pago Stripe</span>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Main Activity Feed & Stream */}
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Flujo de Actividad en Tiempo Real
              </CardTitle>
              <CardDescription className="text-xs">
                Últimos webhooks recibidos y procesados por el motor de eventos.
              </CardDescription>
            </div>

            {/* Filter buttons */}
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'all', label: 'Todos' },
                { id: 'success', label: 'Éxitos' },
                { id: 'warning', label: 'Alertas' },
                { id: 'error', label: 'Errores' },
                { id: 'calendar', label: 'Calendario' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilterType(f.id)}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                    filterType === f.id
                      ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                      : 'bg-muted/70 text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {filteredEvents.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-border/80 rounded-xl">
              <Webhook className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground">No hay eventos para este filtro</p>
              <p className="text-xs text-muted-foreground mt-1">
                Envía un webhook mediante el botón superior o lanza una simulación de prueba.
              </p>
            </div>
          ) : (
            filteredEvents.slice(0, 10).map((event: WebhookEvent) => {
              const isExpanded = expandedEventId === event.id
              return (
                <div
                  key={event.id}
                  className="rounded-xl border border-border/70 bg-card/60 p-4 transition-all duration-150 hover:border-primary/40 hover:bg-card/90"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={getBadgeVariant(event.type)} className="text-[11px] capitalize">
                          {event.type}
                        </Badge>
                        <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded">
                          {event.source}
                        </span>
                        {event.date && (
                          <Badge variant="outline" className="text-[11px] gap-1">
                            <Calendar className="h-3 w-3 text-primary" />
                            {event.date} {event.time || ''}
                          </Badge>
                        )}
                      </div>
                      <h4 className="text-sm font-semibold text-foreground">{event.title}</h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">{event.message}</p>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTimestamp(event.timestamp)}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedEventId(isExpanded ? null : event.id)}
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                      >
                        <Code2 className="h-3 w-3" />
                        <span>JSON</span>
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>

                  {/* Expandable JSON Payload Viewer */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border/60 animate-in fade-in-50">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-mono text-muted-foreground">Payload Completo:</span>
                        <button
                          onClick={() => copyPayload(event.id, event.rawPayload)}
                          className="flex items-center gap-1 text-[11px] text-primary hover:underline font-mono"
                        >
                          {copiedId === event.id ? (
                            <>
                              <Check className="h-3 w-3 text-success" />
                              <span>Copiado</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>Copiar JSON</span>
                            </>
                          )}
                        </button>
                      </div>
                      <pre className="p-3 rounded-lg bg-code border border-border/70 text-[11px] font-mono text-code-foreground overflow-x-auto max-h-48">
                        {JSON.stringify(event.rawPayload, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}
