import { useState } from 'react'
import { Check, Loader2, Plus } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PRESETS } from '@/components/endpoints/presets'
import { RepeatSetting } from '@/components/endpoints/RepeatSetting'
import { validRepeatMinutes } from '@/lib/repeats'
import { cn } from '@/lib/utils'
import type { WebhookEndpoint } from '@/types'

/** Crear un endpoint: nombre y una plantilla de partida. El resto se configura en el detalle. */
export function NewEndpointDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (endpoint: WebhookEndpoint, presetId: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} className="max-w-xl">
      {open && <NewEndpointForm onClose={onClose} onCreated={onCreated} />}
    </Dialog>
  )
}

function NewEndpointForm({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (endpoint: WebhookEndpoint, presetId: string) => void
}) {
  const { createEndpoint } = useApp()
  const [presetId, setPresetId] = useState(PRESETS[0].id)
  const [name, setName] = useState('')
  // Repetir el aviso hasta marcarlo como visto: activado por defecto al crear
  const [repeat, setRepeat] = useState(true)
  const [repeatMinutes, setRepeatMinutes] = useState(15)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0]

  const pickPreset = (id: string) => {
    const next = PRESETS.find((p) => p.id === id)
    // Sugiere el nombre del servicio si aún no se ha escrito otro
    if (next && (!name || PRESETS.some((p) => p.name === name))) setName(next.id === 'blank' ? '' : next.name)
    setPresetId(id)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || (repeat && !validRepeatMinutes(repeatMinutes))) return
    setSaving(true)
    try {
      const created = await createEndpoint({
        name: name.trim(),
        description: preset.id === 'blank' ? '' : preset.description,
        enabled: true,
        popup: true,
        sound: true,
        repeat,
        repeatMinutes: validRepeatMinutes(repeatMinutes) ? repeatMinutes : 15,
        mapping: preset.mapping,
      })
      onCreated(created, preset.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <DialogContent onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Nueva conexión</DialogTitle>
        <DialogDescription>Elige un punto de partida. Después podrás ajustar el mapeo y los avisos.</DialogDescription>
      </DialogHeader>

      <form onSubmit={submit} className="space-y-5 pt-3">
        <div role="radiogroup" aria-label="Plantilla" className="grid gap-2 sm:grid-cols-2">
          {PRESETS.map((p) => {
            const active = p.id === presetId
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => pickPreset(p.id)}
                className={cn(
                  'relative flex items-start gap-3 rounded-xl border p-3 text-left transition-all',
                  active
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border hover:border-foreground/20 hover:bg-accent/40'
                )}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold',
                    active ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                  )}
                >
                  {p.mark}
                </span>
                <span className="min-w-0 pr-4">
                  <span className="block text-sm font-semibold text-foreground">{p.name}</span>
                  <span className="block text-xs leading-snug text-muted-foreground">{p.description}</span>
                </span>
                {active && <Check className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-primary" />}
              </button>
            )
          })}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="new-ep-name" className="text-xs font-semibold text-foreground">
            Nombre
          </label>
          <Input
            id="new-ep-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Servidor de producción"
            maxLength={80}
            required
            autoFocus
          />
          <p className="text-[11px] text-muted-foreground">
            Aparece como origen del aviso cuando el payload no indica otro.
          </p>
        </div>

        <RepeatSetting
          repeat={repeat}
          minutes={repeatMinutes}
          disabled={false}
          onRepeat={setRepeat}
          onMinutes={setRepeatMinutes}
        />

        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving || !name.trim() || (repeat && !validRepeatMinutes(repeatMinutes))} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Crear conexión
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
