import { useMemo, useRef, useState } from 'react'
import {
  Activity,
  Bell,
  Check,
  Eye,
  EyeOff,
  Inbox,
  KeyRound,
  Link2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
  Volume2,
  Wand2,
} from 'lucide-react'
import { useApp, type EndpointData } from '@/context/AppContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Segmented } from '@/components/ui/segmented'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { CodeBlock, CopyButton, useCopy } from '@/components/ui/payload-block'
import { StatusIcon, relativeTime } from '@/components/ui/status'
import { NotificationPreview } from '@/components/endpoints/NotificationPreview'
import { PRESETS, endpointMark } from '@/components/endpoints/presets'
import { parseWebhookLocally, renderMapping } from '@/lib/webhook-parser'
import { cn } from '@/lib/utils'
import type { FieldMapping, MappedField, WebhookEndpoint } from '@/types'

type Section = 'connection' | 'config' | 'activity'

const FIELDS: { id: MappedField; label: string; hint: string; placeholder: string }[] = [
  { id: 'title', label: 'Título', hint: 'Primera línea del aviso', placeholder: 'title' },
  { id: 'message', label: 'Mensaje', hint: 'Texto del aviso', placeholder: 'message' },
  { id: 'type', label: 'Tipo', hint: 'success, warning, error…', placeholder: 'type / level / status' },
  { id: 'source', label: 'Origen', hint: 'Quién lo envía', placeholder: 'source' },
  { id: 'category', label: 'Categoría', hint: 'Etiqueta libre', placeholder: 'category' },
  { id: 'date', label: 'Fecha', hint: 'YYYY-MM-DD → calendario', placeholder: 'date' },
  { id: 'time', label: 'Hora', hint: 'HH:mm', placeholder: 'time' },
]

/** Rutas con valor simple del payload, para insertarlas en el mapeo con un clic. */
function leafPaths(value: unknown, prefix = '', depth = 0, out: string[] = []): string[] {
  if (out.length >= 40 || depth > 4) return out
  if (Array.isArray(value)) {
    if (value.length) leafPaths(value[0], prefix ? `${prefix}.0` : '0', depth + 1, out)
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) leafPaths(v, prefix ? `${prefix}.${k}` : k, depth + 1, out)
  } else if (prefix) {
    out.push(prefix)
  }
  return out
}

function draftOf(ep: WebhookEndpoint): EndpointData {
  return { name: ep.name, description: ep.description, enabled: ep.enabled, popup: ep.popup, sound: ep.sound, mapping: { ...ep.mapping } }
}

function cleanMapping(mapping: FieldMapping): FieldMapping {
  return Object.fromEntries(
    Object.entries(mapping)
      .map(([k, v]) => [k, v?.trim() ?? ''])
      .filter(([, v]) => v)
  )
}

const sameDraft = (a: EndpointData, b: EndpointData) =>
  a.name.trim() === b.name.trim() &&
  a.description.trim() === b.description.trim() &&
  a.popup === b.popup &&
  a.sound === b.sound &&
  JSON.stringify(cleanMapping(a.mapping)) === JSON.stringify(cleanMapping(b.mapping))

export function EndpointDetail({
  endpoint,
  baseUrl,
  hostPicker,
  presetHint,
  onDeleted,
}: {
  endpoint: WebhookEndpoint
  baseUrl: string
  /** Selector «desde la red / desde este equipo» (solo sin sesión y con red). */
  hostPicker?: React.ReactNode
  /** Plantilla con la que se acaba de crear (para el payload de ejemplo). */
  presetHint?: string
  onDeleted: () => void
}) {
  const { events, mode, updateEndpoint, deleteEndpoint } = useApp()
  const [section, setSection] = useState<Section>('connection')
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState<'idle' | 'sending' | 'ok'>('idle')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const url = `${baseUrl}/webhook/${endpoint.id}`
  const received = useMemo(() => events.filter((e) => e.endpointId === endpoint.id), [events, endpoint.id])
  const fail = (err: unknown) => setError(err instanceof Error ? err.message : String(err))

  // Envía un webhook real a la URL (comprueba secreto, estado y mapeo de punta a punta)
  const sendTest = async () => {
    setTesting('sending')
    setError(null)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-webhook-secret': endpoint.secret },
        body: JSON.stringify({ title: `Prueba de ${endpoint.name}`, message: 'Webhook de prueba enviado desde la app', type: 'success' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.message || `La URL respondió ${res.status}`)
      }
      setTesting('ok')
      setTimeout(() => setTesting('idle'), 2000)
    } catch (err) {
      setTesting('idle')
      fail(err)
    }
  }

  return (
    <section className="min-w-0 space-y-5">
      {/* Header */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
          <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-primary to-primary/65 text-sm font-bold text-primary-foreground shadow-md shadow-primary/20">
            {endpointMark(endpoint.name)}
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card',
                endpoint.enabled ? 'bg-success' : 'bg-muted-foreground'
              )}
              aria-hidden
            />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="truncate text-lg font-semibold tracking-tight text-foreground">{endpoint.name}</h2>
            <p className="text-sm text-muted-foreground">{endpoint.description || 'Sin descripción'}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <label className="flex h-8 items-center gap-2 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground">
              {endpoint.enabled ? 'Activo' : 'Pausado'}
              <Switch
                checked={endpoint.enabled}
                onCheckedChange={(enabled) => updateEndpoint(endpoint.id, { enabled }).catch(fail)}
                className="scale-90"
              />
            </label>
            <Button size="sm" onClick={sendTest} disabled={testing === 'sending' || !endpoint.enabled} className="gap-1.5">
              {testing === 'sending' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : testing === 'ok' ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              {testing === 'ok' ? 'Recibido' : 'Probar'}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setConfirmDelete(true)}
              title="Eliminar endpoint"
              aria-label="Eliminar endpoint"
              className="h-8 w-8 hover:border-destructive/40 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <dl className="grid grid-cols-3 divide-x divide-border border-t border-border bg-muted/30 text-center">
          <Stat label="Recibidos" value={String(endpoint.receivedCount)} />
          <Stat label="Último" value={endpoint.lastReceivedAt ? relativeTime(endpoint.lastReceivedAt) : '—'} />
          <Stat label="Guardado en" value={mode === 'cloud' ? 'Servidor' : 'Este equipo'} />
        </dl>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <span>{error}</span>
          <button type="button" className="shrink-0 font-semibold hover:underline" onClick={() => setError(null)}>
            Cerrar
          </button>
        </div>
      )}

      <Segmented<Section>
        ariaLabel="Sección del endpoint"
        value={section}
        onChange={setSection}
        options={[
          { id: 'connection', label: 'Conexión' },
          { id: 'config', label: 'Configuración' },
          { id: 'activity', label: 'Actividad', count: received.length },
        ]}
      />

      <div key={section} className="animate-fade-in">
        {section === 'connection' && <ConnectionSection endpoint={endpoint} url={url} hostPicker={hostPicker} onError={fail} />}
        {section === 'config' && (
          <ConfigSection
            endpoint={endpoint}
            initialSample={received[0]?.rawPayload ?? (PRESETS.find((p) => p.id === presetHint) ?? PRESETS[0]).sample}
            onError={fail}
          />
        )}
        {section === 'activity' && <ActivitySection events={received} />}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false)
          deleteEndpoint(endpoint.id).then(onDeleted).catch(fail)
        }}
        title="¿Eliminar este endpoint?"
        description="Su URL dejará de aceptar webhooks. Los que ya recibió se quedan en el historial."
        items={[endpoint.name]}
      />
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2.5">
      <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  )
}

function Panel({ icon: Icon, title, description, actions, children }: {
  icon: typeof Link2
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="flex min-w-0 items-start gap-2.5">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
        {actions}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// ---------- Conexión ----------

function ConnectionSection({
  endpoint,
  url,
  hostPicker,
  onError,
}: {
  endpoint: WebhookEndpoint
  url: string
  hostPicker?: React.ReactNode
  onError: (err: unknown) => void
}) {
  const { rotateEndpointSecret, mode } = useApp()
  const { copiedKey, copy } = useCopy()
  const [showSecret, setShowSecret] = useState(false)
  const [confirmRotate, setConfirmRotate] = useState(false)

  const curl = `curl -X POST ${url} \\
  -H "Content-Type: application/json" \\
  -H "x-webhook-secret: ${showSecret ? endpoint.secret : '<secreto>'}" \\
  -d '{"title":"Hola","message":"Desde curl","type":"success"}'`
  const curlToCopy = curl.replace('<secreto>', endpoint.secret)

  return (
    <div className="space-y-5">
      <Panel icon={Link2} title="Dirección" description="Pégala en el servicio que envía los webhooks." actions={hostPicker}>
        <div className="space-y-3">
          <Field label="URL" icon={Link2}>
            <span className="flex-1 truncate font-mono text-xs text-foreground">{url}</span>
            <CopyButton copied={copiedKey === 'url'} onClick={() => copy('url', url)} />
          </Field>
          <Field label="Secreto" icon={KeyRound}>
            <span className="flex-1 truncate font-mono text-xs text-foreground">
              {showSecret ? endpoint.secret : '•'.repeat(32)}
            </span>
            <SmallIcon label={showSecret ? 'Ocultar' : 'Mostrar'} onClick={() => setShowSecret((v) => !v)}>
              {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </SmallIcon>
            <CopyButton copied={copiedKey === 'secret'} onClick={() => copy('secret', endpoint.secret)} />
            <SmallIcon label="Generar uno nuevo" onClick={() => setConfirmRotate(true)}>
              <RefreshCw className="h-3.5 w-3.5" />
            </SmallIcon>
          </Field>
          <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            El secreto se envía en
            {['x-webhook-secret', 'Authorization: Bearer', '?secret='].map((w) => (
              <code key={w} className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                {w}
              </code>
            ))}
          </p>
        </div>
      </Panel>

      <CodeBlock
        label="Ejemplo con curl"
        actions={<CopyButton copied={copiedKey === 'curl'} onClick={() => copy('curl', curlToCopy)} />}
      >
        {curl}
      </CodeBlock>

      {mode === 'local' && (
        <p className="rounded-lg border border-dashed border-border px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          Sin sesión, los webhooks llegan a esta app: debe estar abierta o en la bandeja. Para recibirlos desde internet
          (GitHub, Stripe…) expón el puerto con un túnel, p. ej.{' '}
          <code className="font-mono text-foreground">cloudflared tunnel --url http://localhost:3690</code>, y usa esa
          dirección con <code className="font-mono text-foreground">/webhook/{endpoint.id}</code>.
        </p>
      )}

      <ConfirmDialog
        open={confirmRotate}
        onCancel={() => setConfirmRotate(false)}
        onConfirm={() => {
          setConfirmRotate(false)
          rotateEndpointSecret(endpoint.id).catch(onError)
        }}
        title="¿Generar un secreto nuevo?"
        description="El actual dejará de funcionar: tendrás que actualizarlo en el servicio que envía los webhooks."
        confirmLabel="Generar secreto"
        icon={RefreshCw}
      />
    </div>
  )
}

function Field({ label, icon: Icon, children }: { label: string; icon: typeof Link2; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <div className="flex h-10 items-center gap-1 rounded-lg border border-border bg-muted/30 pl-3 pr-1">
        <Icon className="mr-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {children}
      </div>
    </div>
  )
}

function SmallIcon({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  )
}

// ---------- Configuración ----------

function ConfigSection({
  endpoint,
  initialSample,
  onError,
}: {
  endpoint: WebhookEndpoint
  initialSample: Record<string, unknown>
  onError: (err: unknown) => void
}) {
  const { updateEndpoint } = useApp()
  const [draft, setDraft] = useState<EndpointData>(() => draftOf(endpoint))
  const [sampleText, setSampleText] = useState(() => JSON.stringify(initialSample, null, 2))
  const [focused, setFocused] = useState<MappedField>('title')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const inputs = useRef<Partial<Record<MappedField, HTMLInputElement | null>>>({})

  const dirty = !sameDraft(draft, draftOf(endpoint))
  const set = <K extends keyof EndpointData>(key: K, value: EndpointData[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const setField = (field: MappedField, value: string) => setDraft((d) => ({ ...d, mapping: { ...d.mapping, [field]: value } }))

  const sample = useMemo(() => {
    try {
      const raw = JSON.parse(sampleText)
      return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
    } catch {
      return null
    }
  }, [sampleText])
  const preview = useMemo(() => (sample ? parseWebhookLocally(sample, draft.mapping) : null), [sample, draft.mapping])
  const paths = useMemo(() => (sample ? leafPaths(sample) : []), [sample])

  // Clic en una ruta: la usa tal cual si el campo está vacío; si no, la añade como {{ruta}}
  const insertPath = (path: string) => {
    const current = draft.mapping[focused]?.trim() ?? ''
    setField(focused, current ? `${current} {{${path}}}` : path)
    inputs.current[focused]?.focus()
  }

  const save = async () => {
    if (!draft.name.trim()) return
    setSaving(true)
    try {
      const next = await updateEndpoint(endpoint.id, {
        name: draft.name.trim(),
        description: draft.description.trim(),
        popup: draft.popup,
        sound: draft.sound,
        mapping: cleanMapping(draft.mapping),
      })
      setDraft(draftOf(next))
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    } catch (err) {
      onError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5 pb-2">
      <Panel icon={Bell} title="General y avisos">
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-foreground">Nombre</span>
              <Input value={draft.name} onChange={(e) => set('name', e.target.value)} maxLength={80} />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-foreground">Descripción</span>
              <Input
                value={draft.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Para qué sirve (opcional)"
                maxLength={500}
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <OptionTile
              icon={Bell}
              title="Aviso emergente"
              description={draft.popup ? 'Muestra el aviso al llegar' : 'Solo se guarda en el historial'}
              checked={draft.popup}
              onChange={(v) => set('popup', v)}
            />
            <OptionTile
              icon={Volume2}
              title="Sonido"
              description={draft.sound ? 'Timbre según el tipo' : 'Llega en silencio'}
              checked={draft.sound}
              onChange={(v) => set('sound', v)}
              disabled={!draft.popup}
            />
          </div>
        </div>
      </Panel>

      <Panel
        icon={Wand2}
        title="Mapeo de campos"
        description={
          <>
            Una ruta (<code className="font-mono">pull_request.title</code>) o una plantilla (
            <code className="font-mono">{'PR #{{number}}'}</code>). Vacío: detección automática.
          </>
        }
      >
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-2.5">
            {FIELDS.map((f) => {
              const spec = draft.mapping[f.id] ?? ''
              const resolved = sample && spec.trim() ? renderMapping(spec, sample) : ''
              return (
                <div
                  key={f.id}
                  className={cn(
                    'rounded-lg border p-2.5 transition-colors',
                    focused === f.id ? 'border-primary/50 bg-primary/3' : 'border-border'
                  )}
                >
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <label htmlFor={`map-${f.id}`} className="text-xs font-semibold text-foreground">
                      {f.label}
                    </label>
                    <span className="text-[10px] text-muted-foreground">{f.hint}</span>
                  </div>
                  <Input
                    id={`map-${f.id}`}
                    ref={(el) => {
                      inputs.current[f.id] = el
                    }}
                    value={spec}
                    onFocus={() => setFocused(f.id)}
                    onChange={(e) => setField(f.id, e.target.value)}
                    placeholder={`auto · ${f.placeholder}`}
                    maxLength={500}
                    className="h-8 font-mono text-xs"
                  />
                  {spec.trim() && sample && (
                    <p className={cn('mt-1 truncate font-mono text-[11px]', resolved ? 'text-success' : 'text-warning')}>
                      {resolved ? `→ ${resolved}` : '→ sin valor en el ejemplo: se usará la detección automática'}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
            <div className="space-y-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Vista previa</span>
              {preview ? (
                <NotificationPreview
                  event={preview}
                  source={preview.source === 'Simulador UI' ? draft.name || endpoint.name : preview.source}
                  popup={draft.popup}
                  sound={draft.sound}
                />
              ) : (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  El payload de ejemplo no es un objeto JSON válido.
                </p>
              )}
            </div>

            {paths.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] text-muted-foreground">
                  Rutas del ejemplo · clic para usarla en <strong className="text-foreground">{FIELDS.find((f) => f.id === focused)?.label}</strong>
                </span>
                <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
                  {paths.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => insertPath(p)}
                      className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="sample-payload" className="text-[11px] text-muted-foreground">
                Payload de ejemplo {sample && <span className="text-success">· JSON válido</span>}
              </label>
              <textarea
                id="sample-payload"
                value={sampleText}
                onChange={(e) => setSampleText(e.target.value)}
                rows={8}
                spellCheck={false}
                className="w-full rounded-lg border border-border bg-code px-3 py-2 font-mono text-[11px] leading-relaxed text-code-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>
        </div>
      </Panel>

      {/* Barra de guardado */}
      {(dirty || saved) && (
        <div className="sticky bottom-4 z-10 animate-fade-in">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/95 px-4 py-2.5 shadow-lg backdrop-blur">
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {saved && !dirty ? (
                <>
                  <Check className="h-3.5 w-3.5 text-success" /> Cambios guardados
                </>
              ) : (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-warning" /> Cambios sin guardar
                </>
              )}
            </span>
            {dirty && (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setDraft(draftOf(endpoint))} className="gap-1.5">
                  <RotateCcw className="h-3.5 w-3.5" />
                  Descartar
                </Button>
                <Button size="sm" onClick={save} disabled={saving || !draft.name.trim()} className="gap-1.5">
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Guardar
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function OptionTile({
  icon: Icon,
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  icon: typeof Bell
  title: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border p-3 transition-colors',
        checked && !disabled ? 'border-primary/40 bg-primary/5' : 'border-border',
        disabled && 'opacity-50'
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          checked && !disabled ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  )
}

// ---------- Actividad ----------

function ActivitySection({ events }: { events: ReturnType<typeof useApp>['events'] }) {
  if (events.length === 0) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-6 text-center">
        <Inbox className="h-6 w-6 text-muted-foreground/50" />
        <p className="text-sm font-medium text-foreground">Todavía no ha llegado nada</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Pulsa «Probar» o envía un webhook a su URL: aparecerá aquí y en el historial.
        </p>
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Últimos webhooks</h3>
      </div>
      <ul className="divide-y divide-border">
        {events.slice(0, 25).map((e) => (
          <li key={e.id} className="flex items-center gap-3 px-5 py-3">
            <StatusIcon type={e.type} />
            <div className="min-w-0 flex-1">
              <p className={cn('truncate text-sm text-foreground', !e.read && 'font-semibold')}>{e.title}</p>
              <p className="truncate text-xs text-muted-foreground">{e.message}</p>
            </div>
            <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(e.timestamp)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

