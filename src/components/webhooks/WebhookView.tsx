import { useState } from 'react'
import {
  Webhook,
  Search,
  Trash2,
  CheckCheck,
  Copy,
  Check,
  Send,
  Code,
  FileJson,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Calendar,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { WebhookEvent, NotificationType } from '@/types'

export function WebhookView() {
  const {
    events,
    markAsRead,
    markAllAsRead,
    clearEvents,
    addWebhookEvent,
    setOpenSimulator,
  } = useApp()

  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [activeTab, setActiveDocTab] = useState<'history' | 'docs'>('history')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [codeLang, setCodeLang] = useState<'curl' | 'js' | 'python' | 'powershell'>('curl')

  const copyToClipboard = (key: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const filteredEvents = events.filter((e) => {
    const matchesSearch =
      e.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.source.toLowerCase().includes(searchTerm.toLowerCase()) ||
      JSON.stringify(e.rawPayload).toLowerCase().includes(searchTerm.toLowerCase())

    const matchesType = filterType === 'all' || e.type === filterType

    return matchesSearch && matchesType
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

  const curlExample = `curl -X POST http://localhost:5173/api/webhook \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Alerta de Servidor",
    "message": "Uso de memoria superior al 85%",
    "type": "warning",
    "source": "Prometheus",
    "date": "2026-10-14",
    "time": "14:30"
  }'`

  const powershellExample = `$body = @{
    title = "Deploy a Producción"
    message = "Build #452 completado con éxito"
    type = "success"
    source = "GitHub Actions"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5173/api/webhook" -Method POST -ContentType "application/json" -Body $body`

  const jsExample = `fetch('http://localhost:5173/api/webhook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'Reunión de Equipo',
    message: 'Planificación de sprint Q4',
    type: 'calendar',
    date: '2026-10-15',
    time: '11:00',
    category: 'Reunión',
    source: 'Google Calendar'
  })
});`

  const pythonExample = `import requests

payload = {
    "title": "Fallo en el servicio de pagos",
    "message": "Timeout en conexión con Stripe Gateway",
    "type": "error",
    "source": "Stripe"
}

response = requests.post("http://localhost:5173/api/webhook", json=payload)
print(response.json())`

  const getSnippet = () => {
    switch (codeLang) {
      case 'curl':
        return curlExample
      case 'powershell':
        return powershellExample
      case 'js':
        return jsExample
      case 'python':
        return pythonExample
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Webhook className="h-6 w-6 text-primary" />
            Webhooks & Registro de Eventos
          </h1>
          <p className="text-sm text-muted-foreground">
            Inspecciona payloads JSON recibidos, revisa cabeceras y consulta la documentación de integración.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={activeTab === 'history' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveDocTab('history')}
          >
            Historial ({events.length})
          </Button>
          <Button
            variant={activeTab === 'docs' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveDocTab('docs')}
            className="gap-1.5"
          >
            <Code className="h-4 w-4" />
            Documentación API
          </Button>
          <Button
            size="sm"
            onClick={() => setOpenSimulator(true)}
            className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
          >
            <Send className="h-4 w-4" />
            Simulador
          </Button>
        </div>
      </div>

      {activeTab === 'history' ? (
        <div className="space-y-4">
          {/* Filter Bar */}
          <Card className="p-4 border-border/80">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por título, fuente o contenido JSON..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Types */}
                <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
                  {[
                    { id: 'all', label: 'Todos' },
                    { id: 'success', label: 'Éxitos' },
                    { id: 'warning', label: 'Alertas' },
                    { id: 'error', label: 'Errores' },
                    { id: 'calendar', label: 'Calendario' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setFilterType(t.id)}
                      className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                        filterType === t.id
                          ? 'bg-background text-foreground font-semibold shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={markAllAsRead}
                  className="text-xs h-8 gap-1.5"
                  title="Marcar todas como leídas"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span>Marcar Todo Leído</span>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearEvents}
                  className="text-xs h-8 text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5"
                  title="Limpiar registro"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Limpiar</span>
                </Button>
              </div>
            </div>
          </Card>

          {/* Events List */}
          <div className="space-y-3">
            {filteredEvents.length === 0 ? (
              <Card className="p-12 text-center border-dashed border-border/80">
                <FileJson className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <h3 className="font-semibold text-foreground">No se encontraron webhooks</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                  {searchTerm
                    ? 'No hay eventos que coincidan con los términos de búsqueda aplicados.'
                    : 'Aún no se han recibido webhooks. Puedes enviar un JSON desde la pestaña Documentación o usando el Simulador.'}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOpenSimulator(true)}
                  className="mt-4 gap-2"
                >
                  <Send className="h-4 w-4" />
                  <span>Abrir Simulador de Webhook</span>
                </Button>
              </Card>
            ) : (
              filteredEvents.map((event: WebhookEvent) => {
                const isExpanded = expandedId === event.id
                return (
                  <Card
                    key={event.id}
                    className={`transition-all duration-150 border-border/80 hover:border-primary/40 ${
                      !event.read ? 'bg-primary/[0.02] border-l-4 border-l-primary' : 'bg-card'
                    }`}
                  >
                    <div className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="space-y-1.5 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={getBadgeVariant(event.type)} className="text-[11px] capitalize">
                              {event.type}
                            </Badge>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground">
                              {event.source}
                            </span>
                            {event.date && (
                              <Badge variant="outline" className="text-[11px] gap-1">
                                <Calendar className="h-3 w-3 text-primary" />
                                {event.date} {event.time || ''}
                              </Badge>
                            )}
                            {!event.read && (
                              <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                No Leído
                              </span>
                            )}
                          </div>

                          <h3 className="text-base font-semibold text-foreground">{event.title}</h3>
                          <p className="text-xs text-muted-foreground leading-relaxed">{event.message}</p>
                        </div>

                        <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 shrink-0">
                          <span className="text-xs font-mono text-muted-foreground">
                            {new Date(event.timestamp).toLocaleString()}
                          </span>

                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                markAsRead(event.id)
                                addWebhookEvent(event.rawPayload)
                              }}
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                              title="Re-ejecutar webhook"
                            >
                              <RefreshCw className="h-3 w-3" />
                              <span className="hidden sm:inline">Re-lanzar</span>
                            </Button>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                markAsRead(event.id)
                                setExpandedId(isExpanded ? null : event.id)
                              }}
                              className="h-7 px-2.5 text-xs gap-1 font-mono"
                            >
                              <span>{isExpanded ? 'Ocultar JSON' : 'Ver JSON'}</span>
                              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Expandable JSON details */}
                      {isExpanded && (
                        <div className="mt-4 pt-3 border-t border-border/70 space-y-2 animate-in fade-in-50">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono text-muted-foreground">
                              ID: <span className="text-foreground">{event.id}</span>
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                copyToClipboard(event.id, JSON.stringify(event.rawPayload, null, 2))
                              }
                              className="h-7 text-xs font-mono gap-1 text-primary hover:text-primary"
                            >
                              {copiedKey === event.id ? (
                                <>
                                  <Check className="h-3 w-3 text-success" />
                                  <span>Copiado</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3" />
                                  <span>Copiar Payload</span>
                                </>
                              )}
                            </Button>
                          </div>
                          <pre className="p-3.5 rounded-lg bg-code border border-border/80 text-xs font-mono text-code-foreground overflow-x-auto max-h-60">
                            {JSON.stringify(event.rawPayload, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </Card>
                )
              })
            )}
          </div>
        </div>
      ) : (
        /* API Documentation Tab */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 border-border/80 p-6 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-foreground">Cómo enviar Webhooks a PulseDesk</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Puedes enviar peticiones HTTP POST con cualquier cuerpo JSON desde tu terminal, script o servicio en la nube.
              </p>
            </div>

            {/* Endpoints Table */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Endpoints Disponibles</span>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30 font-mono text-xs">
                  <div className="flex items-center gap-2">
                    <span className="bg-success/10 text-success px-2 py-0.5 rounded font-bold">POST</span>
                    <span className="text-foreground">http://localhost:5173/api/webhook</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard('ep1', 'http://localhost:5173/api/webhook')}
                    className="text-muted-foreground hover:text-foreground p-1"
                  >
                    {copiedKey === 'ep1' ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30 font-mono text-xs">
                  <div className="flex items-center gap-2">
                    <span className="bg-success/10 text-success px-2 py-0.5 rounded font-bold">POST</span>
                    <span className="text-foreground">http://localhost:3690/webhook</span>
                    <Badge variant="outline" className="text-[10px] text-primary">Dedicado</Badge>
                  </div>
                  <button
                    onClick={() => copyToClipboard('ep2', 'http://localhost:3690/webhook')}
                    className="text-muted-foreground hover:text-foreground p-1"
                  >
                    {copiedKey === 'ep2' ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Code Snippets */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Ejemplo de Código</span>
                <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
                  {[
                    { id: 'curl', label: 'cURL' },
                    { id: 'powershell', label: 'PowerShell' },
                    { id: 'js', label: 'JavaScript' },
                    { id: 'python', label: 'Python' },
                  ].map((l) => (
                    <button
                      key={l.id}
                      onClick={() => setCodeLang(l.id as 'curl')}
                      className={`px-2 py-0.5 text-xs rounded font-medium transition-colors ${
                        codeLang === l.id ? 'bg-background text-foreground font-semibold shadow-xs' : 'text-muted-foreground'
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative">
                <button
                  onClick={() => copyToClipboard('snippet', getSnippet())}
                  className="absolute right-3 top-3 text-xs font-mono text-muted-foreground hover:text-foreground flex items-center gap-1 bg-card border border-border hover:bg-accent px-2 py-1 rounded"
                >
                  {copiedKey === 'snippet' ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                  <span>Copiar</span>
                </button>
                <pre className="p-4 rounded-xl bg-code text-code-foreground font-mono text-xs overflow-x-auto border border-border/80 leading-relaxed">
                  {getSnippet()}
                </pre>
              </div>
            </div>
          </Card>

          {/* JSON Schema Definition */}
          <Card className="border-border/80 p-6 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <FileJson className="h-4 w-4 text-primary" />
                Estructura del Payload JSON
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                El motor analiza de forma inteligente las claves principales:
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-2.5 rounded-lg border border-border/70 bg-card/60 space-y-1">
                <div className="font-mono text-primary font-semibold">title / subject / event</div>
                <div className="text-muted-foreground">Título principal mostrado en la notificación.</div>
              </div>

              <div className="p-2.5 rounded-lg border border-border/70 bg-card/60 space-y-1">
                <div className="font-mono text-primary font-semibold">message / description / text</div>
                <div className="text-muted-foreground">Cuerpo del mensaje o detalle descriptivo.</div>
              </div>

              <div className="p-2.5 rounded-lg border border-border/70 bg-card/60 space-y-1">
                <div className="font-mono text-primary font-semibold">type / status / level</div>
                <div className="text-muted-foreground">&quot;success&quot;, &quot;warning&quot;, &quot;error&quot;, &quot;info&quot;, o &quot;calendar&quot;.</div>
              </div>

              <div className="p-2.5 rounded-lg border border-border/70 bg-card/60 space-y-1">
                <div className="font-mono text-primary font-semibold">date & time (Opcional)</div>
                <div className="text-muted-foreground">
                  Ej. &quot;2026-10-15&quot; y &quot;14:00&quot;. Agrega el evento automáticamente al Calendario.
                </div>
              </div>

              <div className="p-2.5 rounded-lg border border-border/70 bg-card/60 space-y-1">
                <div className="font-mono text-primary font-semibold">source (Opcional)</div>
                <div className="text-muted-foreground">Nombre del emisor (ej. GitHub, Jira, Stripe, Servidor).</div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
