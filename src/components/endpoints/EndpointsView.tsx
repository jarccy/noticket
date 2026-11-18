import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  Bell,
  BellOff,
  Check,
  Copy,
  Database,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Server,
  Terminal,
  Trash2,
  Volume2,
  VolumeX,
  Webhook,
  Wand2,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Segmented } from '@/components/ui/segmented'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { relativeTime } from '@/components/ui/status'
import { EndpointDialog } from '@/components/endpoints/EndpointDialog'
import { API_URL } from '@/services/api'
import { isTauri } from '@/lib/platform'
import { cn } from '@/lib/utils'
import type { WebhookEndpoint } from '@/types'

type Host = 'lan' | 'local'

/** Base de las URLs: el backend con sesión; sin sesión, el servidor de la app (puerto 3690). */
function useBaseUrls() {
  const { mode } = useApp()
  const [local, setLocal] = useState<{ local: string; lan?: string }>({ local: 'http://localhost:3690' })
  useEffect(() => {
    if (mode === 'cloud' || !isTauri()) return
    invoke<string[]>('local_webhook_urls')
      .then(([localUrl, lanUrl]) =>
        setLocal({ local: localUrl.replace(/\/webhook$/, ''), lan: lanUrl?.replace(/\/webhook$/, '') })
      )
      .catch(() => {})
  }, [mode])
  return mode === 'cloud' ? { local: API_URL, lan: undefined } : local
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

function IconButton({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
    >
      {children}
    </button>
  )
}

function curlFor(url: string, secret: string) {
  return `curl -X POST ${url} \\\n  -H "Content-Type: application/json" \\\n  -H "x-webhook-secret: ${secret}" \\\n  -d '{"title":"Hola","message":"Prueba","type":"success"}'`
}

function EndpointCard({
  endpoint,
  baseUrl,
  onEdit,
  onDelete,
  onError,
}: {
  endpoint: WebhookEndpoint
  baseUrl: string
  onEdit: () => void
  onDelete: () => void
  onError: (msg: string) => void
}) {
  const { updateEndpoint, rotateEndpointSecret } = useApp()
  const [showSecret, setShowSecret] = useState(false)
  const [confirmRotate, setConfirmRotate] = useState(false)
  const [testing, setTesting] = useState<'idle' | 'sending' | 'ok' | 'fail'>('idle')
  const url = `${baseUrl}/webhook/${endpoint.id}`
  const mapped = Object.values(endpoint.mapping).filter(Boolean).length

  const run = (p: Promise<unknown>) => p.catch((err) => onError(err instanceof Error ? err.message : String(err)))

  // Envía un webhook real a la URL del endpoint (comprueba secreto, estado y mapeo)
  const sendTest = async () => {
    setTesting('sending')
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-webhook-secret': endpoint.secret },
        body: JSON.stringify({
          title: `Prueba de ${endpoint.name}`,
          message: 'Webhook de prueba enviado desde la app',
          type: 'success',
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.message || `La URL respondió ${res.status}`)
      }
      setTesting('ok')
    } catch (err) {
      setTesting('fail')
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setTimeout(() => setTesting('idle'), 2000)
    }
  }

  return (
    <Card className={cn('border-border/80 transition-opacity', !endpoint.enabled && 'opacity-70')}>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Webhook className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-foreground">{endpoint.name}</h3>
              <Badge variant={endpoint.enabled ? 'success' : 'secondary'} className="text-[10px]">
                {endpoint.enabled ? 'Activo' : 'Pausado'}
              </Badge>
            </div>
            {endpoint.description && <p className="mt-0.5 text-xs text-muted-foreground">{endpoint.description}</p>}
          </div>
          <Switch
            checked={endpoint.enabled}
            onCheckedChange={(enabled) => run(updateEndpoint(endpoint.id, { enabled }))}
            className="mt-1"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1 rounded-lg border border-border/80 bg-muted/30 py-1 pl-3 pr-1">
            <span className="w-14 shrink-0 text-[11px] text-muted-foreground">URL</span>
            <span className="flex-1 truncate font-mono text-xs text-foreground">{url}</span>
            <CopyButton text={url} label="Copiar URL" />
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border/80 bg-muted/30 py-1 pl-3 pr-1">
            <span className="w-14 shrink-0 text-[11px] text-muted-foreground">Secreto</span>
            <span className="flex-1 truncate font-mono text-xs text-foreground">
              {showSecret ? endpoint.secret : '•'.repeat(24)}
            </span>
            <IconButton label={showSecret ? 'Ocultar secreto' : 'Mostrar secreto'} onClick={() => setShowSecret((v) => !v)}>
              {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </IconButton>
            <CopyButton text={endpoint.secret} label="Copiar secreto" />
            <IconButton label="Generar un secreto nuevo" onClick={() => setConfirmRotate(true)}>
              <RefreshCw className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1" title={endpoint.popup ? 'Muestra aviso emergente' : 'Solo se guarda en el historial'}>
            {endpoint.popup ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
            {endpoint.popup ? 'Aviso' : 'Sin aviso'}
          </span>
          <span className="flex items-center gap-1">
            {endpoint.sound ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            {endpoint.sound ? 'Sonido' : 'Silencio'}
          </span>
          <span className="flex items-center gap-1">
            <Wand2 className="h-3.5 w-3.5" />
            {mapped ? `${mapped} ${mapped === 1 ? 'campo mapeado' : 'campos mapeados'}` : 'Detección automática'}
          </span>
          <span className="tabular-nums">
            {endpoint.receivedCount} recibidos
            {endpoint.lastReceivedAt && ` · último ${relativeTime(endpoint.lastReceivedAt)}`}
          </span>

          <div className="ml-auto flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={sendTest} disabled={testing === 'sending'}>
              {testing === 'ok' ? <Check className="h-3.5 w-3.5 text-success" /> : <Send className="h-3.5 w-3.5" />}
              {testing === 'sending' ? 'Enviando…' : testing === 'ok' ? 'Recibido' : 'Probar'}
            </Button>
            <CopyButton text={curlFor(url, endpoint.secret)} label="Copiar ejemplo curl" />
            <IconButton label="Configurar" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton label="Eliminar" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        </div>
      </CardContent>

      <ConfirmDialog
        open={confirmRotate}
        onCancel={() => setConfirmRotate(false)}
        onConfirm={() => {
          setConfirmRotate(false)
          run(rotateEndpointSecret(endpoint.id))
        }}
        title="¿Generar un secreto nuevo?"
        description="El secreto actual dejará de funcionar: tendrás que actualizarlo en el servicio que envía los webhooks."
        confirmLabel="Generar secreto"
        icon={RefreshCw}
      />
    </Card>
  )
}

export function EndpointsView() {
  const { endpoints, endpointsAvailable, mode, deleteEndpoint } = useApp()
  const base = useBaseUrls()
  const [host, setHost] = useState<Host>('lan')
  const [editing, setEditing] = useState<WebhookEndpoint | 'new' | null>(null)
  const [deleting, setDeleting] = useState<WebhookEndpoint | null>(null)
  const [error, setError] = useState<string | null>(null)

  const baseUrl = host === 'lan' && base.lan ? base.lan : base.local

  return (
    <div className="space-y-6">
      <PageHeader
        title="Endpoints"
        description="Cada endpoint tiene su propia URL, su secreto y su forma de mostrar los webhooks que recibe."
        actions={
          endpointsAvailable && (
            <Button onClick={() => setEditing('new')} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Nuevo endpoint
            </Button>
          )
        }
      />

      {!endpointsAvailable ? (
        <Card className="border-border/80">
          <CardContent className="space-y-2 p-6 text-center">
            <Server className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Sin servidor que reciba los webhooks</p>
            <p className="mx-auto max-w-md text-xs text-muted-foreground">
              En el navegador sin sesión no hay nada escuchando. Inicia sesión para usar el backend, o abre la app de
              escritorio, que recibe los webhooks en el puerto 3690 y los guarda en este equipo.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              {mode === 'cloud' ? <Server className="h-3.5 w-3.5" /> : <Database className="h-3.5 w-3.5" />}
              {mode === 'cloud'
                ? 'Guardados en el servidor: los webhooks se reciben aunque esta app esté cerrada.'
                : 'Guardados en este equipo (SQLite): la app debe estar abierta o en la bandeja para recibirlos.'}
            </span>
            {base.lan && (
              <Segmented<Host>
                value={host}
                onChange={setHost}
                ariaLabel="Dirección de las URLs"
                className="ml-auto"
                options={[
                  { id: 'lan', label: 'Desde la red' },
                  { id: 'local', label: 'Desde este equipo' },
                ]}
              />
            )}
          </div>

          {error && (
            <p className="flex items-start justify-between gap-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
              <button type="button" className="font-semibold" onClick={() => setError(null)}>
                Cerrar
              </button>
            </p>
          )}

          {endpoints.length === 0 ? (
            <Card className="border-dashed border-border">
              <CardContent className="space-y-3 p-8 text-center">
                <Terminal className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">Aún no tienes endpoints</p>
                <p className="mx-auto max-w-md text-xs text-muted-foreground">
                  Crea uno por integración (GitHub, Stripe, tu servidor…) para darle su propia URL y secreto, decidir si
                  avisa o suena, y elegir qué campos del JSON usar como título, mensaje o tipo.
                </p>
                <Button variant="outline" size="sm" onClick={() => setEditing('new')} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  Crear el primero
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {endpoints.map((ep) => (
                <EndpointCard
                  key={ep.id}
                  endpoint={ep}
                  baseUrl={baseUrl}
                  onEdit={() => setEditing(ep)}
                  onDelete={() => setDeleting(ep)}
                  onError={setError}
                />
              ))}
            </div>
          )}
        </>
      )}

      <EndpointDialog
        open={editing !== null}
        endpoint={editing === 'new' || editing === null ? undefined : editing}
        onClose={() => setEditing(null)}
      />

      <ConfirmDialog
        open={deleting !== null}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const ep = deleting
          setDeleting(null)
          if (ep) deleteEndpoint(ep.id).catch((err) => setError(err instanceof Error ? err.message : String(err)))
        }}
        title="¿Eliminar este endpoint?"
        description="Su URL dejará de aceptar webhooks. Los que ya recibió se quedan en el historial."
        items={deleting ? [deleting.name] : []}
      />
    </div>
  )
}
