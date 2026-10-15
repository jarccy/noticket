import { useState } from 'react'
import { Search, Trash2, CheckCheck, ListChecks, ChevronDown, RefreshCw, Inbox, X } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { isAdmin } from '@/lib/auth'
import { EventDetails } from '@/components/webhooks/EventDetails'
import { PageHeader } from '@/components/ui/page-header'
import { Segmented } from '@/components/ui/segmented'
import { StatusIcon, TYPE_FILTERS, relativeTime, type TypeFilter } from '@/components/ui/status'
import { CodeBlock, CopyButton, useCopy } from '@/components/ui/payload-block'
import { isTauri, WEBHOOK_ENDPOINT } from '@/lib/platform'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Checkbox, SelectionBar, useSelection } from '@/components/ui/selection'
import { cn } from '@/lib/utils'

type CodeLang = 'curl' | 'powershell' | 'js' | 'python'

const SNIPPETS: Record<CodeLang, string> = {
  curl: `curl -X POST ${WEBHOOK_ENDPOINT} \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Alerta de Servidor",
    "message": "Uso de memoria superior al 85%",
    "type": "warning",
    "source": "Prometheus",
    "date": "2026-10-14",
    "time": "14:30"
  }'`,
  powershell: `$body = @{
    title = "Deploy a Producción"
    message = "Build #452 completado con éxito"
    type = "success"
    source = "GitHub Actions"
} | ConvertTo-Json

Invoke-RestMethod -Uri "${WEBHOOK_ENDPOINT}" -Method POST -ContentType "application/json" -Body $body`,
  js: `fetch('${WEBHOOK_ENDPOINT}', {
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
});`,
  python: `import requests

payload = {
    "title": "Fallo en el servicio de pagos",
    "message": "Timeout en conexión con Stripe Gateway",
    "type": "error",
    "source": "Stripe"
}

response = requests.post("${WEBHOOK_ENDPOINT}", json=payload)
print(response.json())`,
}

const FIELDS = [
  { keys: 'title · subject · event', desc: 'Título de la notificación.' },
  { keys: 'message · description · text', desc: 'Cuerpo o detalle del evento.' },
  { keys: 'type · status · level', desc: 'success, warning, error, info o calendar.' },
  { keys: 'date · time', desc: 'Opcional. Ej. "2026-10-15" y "14:00". Lo agrega al calendario.' },
  { keys: 'source', desc: 'Opcional. Emisor: GitHub, Jira, Stripe…' },
]

export function WebhookView() {
  const { events, markAsRead, markAllAsRead, clearEvents, deleteEvents, addWebhookEvent } = useApp()

  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<TypeFilter>('all')
  const [view, setView] = useState<'history' | 'docs'>('history')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [codeLang, setCodeLang] = useState<CodeLang>('curl')
  // Borrado pendiente de confirmar: unos ids concretos o todo el historial
  const [pendingDelete, setPendingDelete] = useState<{ ids: string[]; all?: boolean } | null>(null)
  const { copiedKey, copy } = useCopy()
  const { user } = useAuth()
  const admin = isAdmin(user)

  const term = searchTerm.toLowerCase()
  const filteredEvents = events.filter((e) => {
    const matchesSearch =
      e.title.toLowerCase().includes(term) ||
      e.message.toLowerCase().includes(term) ||
      e.source.toLowerCase().includes(term) ||
      (admin && JSON.stringify(e.rawPayload).toLowerCase().includes(term))
    const matchesType = filterType === 'all' || e.type === filterType
    return matchesSearch && matchesType
  })

  const unread = events.filter((e) => !e.read).length
  const selection = useSelection(filteredEvents.map((e) => e.id))

  const confirmDelete = () => {
    if (!pendingDelete) return
    if (pendingDelete.all) clearEvents()
    else deleteEvents(pendingDelete.ids)
    if (expandedId && pendingDelete.ids.includes(expandedId)) setExpandedId(null)
    setPendingDelete(null)
    selection.stop()
  }

  const pendingTitles = pendingDelete
    ? events.filter((e) => pendingDelete.all || pendingDelete.ids.includes(e.id)).map((e) => e.title)
    : []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Webhooks & Logs"
        description={
          admin
            ? 'Inspecciona los payloads recibidos y consulta cómo integrar tus servicios.'
            : 'Todas las notificaciones que has recibido, con su detalle.'
        }
        actions={
          user && (
            <Segmented
              ariaLabel="Vista"
              value={view}
              onChange={setView}
              options={[
                { id: 'history', label: 'Historial', count: events.length },
                { id: 'docs', label: 'Integración' },
              ]}
            />
          )
        }
      />

      {view === 'history' || !user ? (
        <div className="space-y-3">
          {/* Toolbar */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={admin ? 'Buscar por título, fuente o contenido JSON' : 'Buscar por título, mensaje o fuente'}
                aria-label="Buscar webhooks"
                className="h-9 w-full rounded-lg border border-input bg-card pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                ariaLabel="Filtrar por tipo"
                value={filterType}
                onChange={setFilterType}
                options={TYPE_FILTERS.map((f) => ({ id: f.id, label: f.label }))}
              />
              <button
                type="button"
                onClick={markAllAsRead}
                disabled={unread === 0}
                title="Marcar todo como leído"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Leído
              </button>
              <button
                type="button"
                onClick={() => (selection.active ? selection.stop() : selection.start())}
                disabled={filteredEvents.length === 0}
                aria-pressed={selection.active}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40',
                  selection.active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                <ListChecks className="h-3.5 w-3.5" />
                Seleccionar
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete({ ids: events.map((e) => e.id), all: true })}
                disabled={events.length === 0}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Limpiar
              </button>
            </div>
          </div>

          {selection.active && filteredEvents.length > 0 && (
            <SelectionBar
              selection={selection}
              total={filteredEvents.length}
              noun={['webhook seleccionado', 'webhooks seleccionados']}
              onDelete={() => setPendingDelete({ ids: selection.selected })}
            />
          )}

          {/* Log list */}
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {filteredEvents.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
                <Inbox className="h-6 w-6 text-muted-foreground/50" />
                <p className="text-sm font-medium text-foreground">
                  {searchTerm || filterType !== 'all' ? 'Sin resultados' : 'Aún no hay webhooks'}
                </p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  {searchTerm || filterType !== 'all'
                    ? 'Prueba con otro término o quita el filtro.'
                    : user
                      ? 'Aquí aparecerán las notificaciones que recibas.'
                      : 'Inicia sesión para recibir webhooks de tus servicios.'}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filteredEvents.map((event) => {
                  const selecting = selection.active
                  const isSelected = selecting && selection.isSelected(event.id)
                  const isExpanded = !selecting && expandedId === event.id
                  return (
                    <li
                      key={event.id}
                      className={cn('flex items-stretch', isExpanded && 'bg-accent/30', isSelected && 'bg-primary/5')}
                    >
                      {selecting && (
                        <span className="flex items-center pl-4">
                          <Checkbox
                            checked={isSelected}
                            onChange={() => selection.toggle(event.id)}
                            label={`Seleccionar «${event.title}»`}
                          />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          aria-expanded={selecting ? undefined : isExpanded}
                          onClick={() => {
                            if (selecting) return selection.toggle(event.id)
                            markAsRead(event.id)
                            setExpandedId(isExpanded ? null : event.id)
                          }}
                          className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40 md:grid-cols-[auto_minmax(0,1fr)_160px_110px_auto]"
                        >
                          <StatusIcon type={event.type} />
                          <div className="min-w-0">
                            <p className={cn('flex items-center gap-2 truncate text-sm text-foreground', !event.read && 'font-semibold')}>
                              {!event.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="No leído" />}
                              <span className="truncate">{event.title}</span>
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{event.message}</p>
                          </div>
                          <span className="hidden truncate text-xs text-muted-foreground md:block">{event.source}</span>
                          <span className="hidden text-right text-xs text-muted-foreground md:block" title={new Date(event.timestamp).toLocaleString()}>
                            {relativeTime(event.timestamp)}
                          </span>
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 text-muted-foreground transition-transform',
                              isExpanded && 'rotate-180',
                              selecting && 'invisible'
                            )}
                          />
                        </button>

                        {isExpanded && (
                          <div className="px-4 pb-4 md:pl-[60px]">
                            <EventDetails
                              event={event}
                              showJsonToggle={admin}
                              actions={
                                <>
                                  {admin && (
                                    <button
                                      type="button"
                                      onClick={() => addWebhookEvent(event.rawPayload)}
                                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                    >
                                      <RefreshCw className="h-3.5 w-3.5" />
                                      Re-enviar
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setPendingDelete({ ids: [event.id] })}
                                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Eliminar
                                  </button>
                                </>
                              }
                              json={
                                <CodeBlock
                                  label={`payload.json · ${event.id}`}
                                  actions={
                                    <CopyButton
                                      copied={copiedKey === event.id}
                                      onClick={() => copy(event.id, JSON.stringify(event.rawPayload, null, 2))}
                                    />
                                  }
                                >
                                  {JSON.stringify(event.rawPayload, null, 2)}
                                </CodeBlock>
                              }
                            />
                          </div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <ConfirmDialog
            open={pendingDelete !== null}
            onCancel={() => setPendingDelete(null)}
            onConfirm={confirmDelete}
            title={
              pendingDelete?.all
                ? '¿Vaciar todo el historial?'
                : pendingTitles.length === 1
                  ? '¿Eliminar este webhook?'
                  : `¿Eliminar ${pendingTitles.length} webhooks?`
            }
            description={
              pendingDelete?.all
                ? `Se eliminarán los ${pendingTitles.length} webhooks del historial. No se puede deshacer.`
                : 'Desaparecerán de tu historial. No se puede deshacer.'
            }
            items={pendingTitles}
            confirmLabel={pendingDelete?.all ? 'Vaciar historial' : 'Eliminar'}
          />
          {filteredEvents.length > 0 && (
            <p className="px-1 text-xs text-muted-foreground">
              {filteredEvents.length} de {events.length} eventos
              {unread > 0 && ` · ${unread} sin leer`}
            </p>
          )}
        </div>
      ) : (
        /* Integration docs */
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-8">
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Endpoint</h2>
              <div className="space-y-2">
                <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                  <span className="rounded-md bg-success/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-success">POST</span>
                  <span className="flex-1 truncate font-mono text-sm text-foreground">{WEBHOOK_ENDPOINT}</span>
                  <CopyButton copied={copiedKey === 'ep'} onClick={() => copy('ep', WEBHOOK_ENDPOINT)} />
                </div>
                {/* Vite dev-server endpoint: only exists under `pnpm dev` in the browser */}
                {!isTauri() && (
                  <div className="flex items-center gap-3 rounded-xl border border-dashed border-border p-3">
                    <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground">POST</span>
                    <span className="flex-1 truncate font-mono text-sm text-muted-foreground">
                      http://localhost:5173/api/webhook
                    </span>
                    <span className="text-[11px] text-muted-foreground">solo pnpm dev</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Acepta cualquier cuerpo JSON. Responde <code className="font-mono text-foreground">200</code> con el id del evento.
              </p>
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-foreground">Ejemplo</h2>
                <Segmented
                  ariaLabel="Lenguaje"
                  value={codeLang}
                  onChange={setCodeLang}
                  options={[
                    { id: 'curl', label: 'cURL' },
                    { id: 'powershell', label: 'PowerShell' },
                    { id: 'js', label: 'JavaScript' },
                    { id: 'python', label: 'Python' },
                  ]}
                />
              </div>
              <CodeBlock
                label={codeLang}
                maxHeight="max-h-80"
                actions={
                  <CopyButton copied={copiedKey === 'snippet'} onClick={() => copy('snippet', SNIPPETS[codeLang])} />
                }
              >
                {SNIPPETS[codeLang]}
              </CodeBlock>
            </section>
          </div>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Campos reconocidos</h2>
            <dl className="space-y-4">
              {FIELDS.map((f) => (
                <div key={f.keys} className="space-y-1">
                  <dt className="font-mono text-xs font-medium text-foreground">{f.keys}</dt>
                  <dd className="text-xs leading-relaxed text-muted-foreground">{f.desc}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      )}
    </div>
  )
}
