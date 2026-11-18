import { useMemo, useState } from 'react'
import { Loader2, Webhook } from 'lucide-react'
import { useApp, type EndpointData } from '@/context/AppContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { StatusIcon, STATUS } from '@/components/ui/status'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { parseWebhookLocally } from '@/lib/webhook-parser'
import type { FieldMapping, MappedField, WebhookEndpoint } from '@/types'

const FIELDS: { id: MappedField; label: string; placeholder: string }[] = [
  { id: 'title', label: 'Título', placeholder: 'PR #{{number}}: {{pull_request.title}}' },
  { id: 'message', label: 'Mensaje', placeholder: 'pull_request.body' },
  { id: 'type', label: 'Tipo', placeholder: 'pull_request.state  (success, warning, error…)' },
  { id: 'source', label: 'Origen', placeholder: 'repository.full_name' },
  { id: 'category', label: 'Categoría', placeholder: 'action' },
  { id: 'date', label: 'Fecha (YYYY-MM-DD)', placeholder: 'event.date' },
  { id: 'time', label: 'Hora (HH:mm)', placeholder: 'event.time' },
]

const SAMPLE = `{
  "action": "opened",
  "number": 42,
  "pull_request": { "title": "Arreglar login", "body": "Corrige el bucle de redirección", "state": "success" },
  "repository": { "full_name": "acme/app" }
}`

const textareaClass =
  'w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

/** Crear un endpoint (sin `endpoint`) o editar su configuración. */
export function EndpointDialog({
  open,
  endpoint,
  onClose,
}: {
  open: boolean
  endpoint?: WebhookEndpoint
  onClose: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} className="max-w-2xl">
      {/* key: el formulario se reinicia cada vez que se abre */}
      {open && <EndpointForm key={endpoint?.id ?? 'new'} endpoint={endpoint} onClose={onClose} />}
    </Dialog>
  )
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function EndpointForm({ endpoint, onClose }: { endpoint?: WebhookEndpoint; onClose: () => void }) {
  const { createEndpoint, updateEndpoint } = useApp()
  const [data, setData] = useState<EndpointData>({
    name: endpoint?.name ?? '',
    description: endpoint?.description ?? '',
    enabled: endpoint?.enabled ?? true,
    popup: endpoint?.popup ?? true,
    sound: endpoint?.sound ?? true,
    mapping: endpoint?.mapping ?? {},
  })
  const [sample, setSample] = useState(SAMPLE)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof EndpointData>(key: K, value: EndpointData[K]) => setData((d) => ({ ...d, [key]: value }))
  const setField = (field: MappedField, value: string) =>
    setData((d) => ({ ...d, mapping: { ...d.mapping, [field]: value } }))

  // Vista previa: el mismo parser que usa la app (y las mismas reglas que Rust y el backend)
  const preview = useMemo(() => {
    try {
      const raw = JSON.parse(sample)
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'El ejemplo debe ser un objeto JSON' }
      return { event: parseWebhookLocally(raw, data.mapping) }
    } catch {
      return { error: 'JSON de ejemplo inválido' }
    }
  }, [sample, data.mapping])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!data.name.trim()) return
    const mapping: FieldMapping = Object.fromEntries(
      Object.entries(data.mapping).filter(([, v]) => v && v.trim()).map(([k, v]) => [k, v!.trim()])
    )
    const payload = { ...data, name: data.name.trim(), description: data.description.trim(), mapping }
    setSaving(true)
    try {
      if (endpoint) await updateEndpoint(endpoint.id, payload)
      else await createEndpoint(payload)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <DialogContent onClose={onClose}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Webhook className="h-5 w-5 text-primary" />
          {endpoint ? 'Configurar endpoint' : 'Nuevo endpoint'}
        </DialogTitle>
        <DialogDescription>
          Tendrá su propia URL y su propio secreto. Configura cómo se muestran los webhooks que lleguen a él.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={submit} className="space-y-5 pt-2">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="ep-name" className="text-xs font-semibold text-foreground">
              Nombre *
            </label>
            <Input
              id="ep-name"
              value={data.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Ej. GitHub, Stripe, Backups"
              maxLength={80}
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="ep-desc" className="text-xs font-semibold text-foreground">
              Descripción
            </label>
            <Input
              id="ep-desc"
              value={data.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Para qué sirve (opcional)"
              maxLength={500}
            />
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-border/80 p-3">
          <ToggleRow
            label="Activo"
            hint="Pausado, la URL responde 423 y no se registra nada."
            checked={data.enabled}
            onChange={(v) => set('enabled', v)}
          />
          <ToggleRow
            label="Aviso emergente"
            hint="Desactivado, el webhook solo se guarda en el historial."
            checked={data.popup}
            onChange={(v) => set('popup', v)}
          />
          <ToggleRow
            label="Sonido"
            hint="Reproduce el timbre según el tipo (si el sonido general está activo)."
            checked={data.sound}
            onChange={(v) => set('sound', v)}
          />
        </div>

        <div className="space-y-2">
          <div className="space-y-0.5">
            <span className="text-sm font-semibold text-foreground">Mapeo de campos</span>
            <p className="text-xs text-muted-foreground">
              Una ruta del JSON (<code>pull_request.title</code>, <code>commits.0.message</code>) o una plantilla (
              <code>{'PR #{{number}}: {{pull_request.title}}'}</code>). Si lo dejas vacío, o el valor no existe, se usa
              la detección automática.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.id} className="space-y-1">
                <label htmlFor={`ep-map-${f.id}`} className="text-[11px] font-medium text-muted-foreground">
                  {f.label}
                </label>
                <Input
                  id={`ep-map-${f.id}`}
                  value={data.mapping[f.id] ?? ''}
                  onChange={(e) => setField(f.id, e.target.value)}
                  placeholder={f.placeholder}
                  maxLength={500}
                  className="font-mono text-xs"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="ep-sample" className="text-[11px] font-medium text-muted-foreground">
              Payload de ejemplo (para probar el mapeo)
            </label>
            <textarea
              id="ep-sample"
              value={sample}
              onChange={(e) => setSample(e.target.value)}
              rows={9}
              spellCheck={false}
              className={`${textareaClass} font-mono text-[11px]`}
            />
          </div>
          <div className="space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Así se verá</span>
            {'error' in preview ? (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{preview.error}</p>
            ) : (
              preview.event && (
                <div className="space-y-2 rounded-lg border border-border/80 bg-muted/30 p-3">
                  <div className="flex items-start gap-2">
                    <StatusIcon type={preview.event.type} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{preview.event.title}</p>
                      <p className="line-clamp-3 text-xs text-muted-foreground">{preview.event.message}</p>
                    </div>
                  </div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
                    <dt className="text-muted-foreground">Tipo</dt>
                    <dd className="text-foreground">{STATUS[preview.event.type].label}</dd>
                    <dt className="text-muted-foreground">Origen</dt>
                    <dd className="truncate text-foreground">
                      {preview.event.source === 'Simulador UI' ? data.name || 'Nombre del endpoint' : preview.event.source}
                    </dd>
                    {preview.event.category && (
                      <>
                        <dt className="text-muted-foreground">Categoría</dt>
                        <dd className="truncate text-foreground">{preview.event.category}</dd>
                      </>
                    )}
                    {(preview.event.date || preview.event.time) && (
                      <>
                        <dt className="text-muted-foreground">Agenda</dt>
                        <dd className="text-foreground">
                          {[preview.event.date, preview.event.time].filter(Boolean).join(' ')}
                        </dd>
                      </>
                    )}
                  </dl>
                </div>
              )
            )}
          </div>
        </div>

        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving || !data.name.trim()} className="gap-1.5">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {endpoint ? 'Guardar cambios' : 'Crear endpoint'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
