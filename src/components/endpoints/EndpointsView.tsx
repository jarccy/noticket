import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { BellOff, Database, Plus, Repeat, Server, VolumeX, Webhook } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { relativeTime } from '@/components/ui/status'
import { EndpointDetail } from '@/components/endpoints/EndpointDetail'
import { NewEndpointDialog } from '@/components/endpoints/NewEndpointDialog'
import { PRESETS, endpointMark } from '@/components/endpoints/presets'
import { API_URL } from '@/services/api'
import { isTauri } from '@/lib/platform'
import { cn } from '@/lib/utils'

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

export function EndpointsView() {
  const { endpoints, endpointsAvailable, mode } = useApp()
  const base = useBaseUrls()
  const [host, setHost] = useState<Host>('lan')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [presetHints, setPresetHints] = useState<Record<string, string>>({})

  const selected = endpoints.find((ep) => ep.id === selectedId) ?? endpoints[0] ?? null
  const baseUrl = host === 'lan' && base.lan ? base.lan : base.local

  const hostPicker = base.lan ? (
    <Segmented<Host>
      value={host}
      onChange={setHost}
      ariaLabel="Desde dónde se envía"
      options={[
        { id: 'lan', label: 'Desde la red' },
        { id: 'local', label: 'Este equipo' },
      ]}
    />
  ) : undefined

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conexiones"
        description="Conecta tus apps y servicios. Cada conexión tiene su propia dirección para enviarte avisos y tú decides cómo se muestran."
        actions={
          endpointsAvailable &&
          endpoints.length > 0 && (
            <Button onClick={() => setCreating(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Nueva conexión
            </Button>
          )
        }
      />

      {!endpointsAvailable ? (
        <EmptyHero
          icon={Server}
          title="Necesitas iniciar sesión o la app de escritorio"
          text="En el navegador sin sesión nadie recibe los webhooks. Inicia sesión para usar el servidor, o abre la app de escritorio: los recibe en el puerto 3690 y los guarda en este equipo."
        />
      ) : endpoints.length === 0 ? (
        <EmptyHero
          icon={Webhook}
          title="Crea tu primera conexión"
          text="Dale a cada servicio (GitHub, Stripe, tu servidor…) su propia URL y secreto, decide si avisa o suena, y elige qué campos del JSON forman el aviso."
        >
          <div className="flex flex-wrap justify-center gap-2">
            {PRESETS.map((p) => (
              <span
                key={p.id}
                className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground"
              >
                <span className="font-mono text-[10px] font-bold text-foreground">{p.mark}</span>
                {p.name}
              </span>
            ))}
          </div>
          <Button onClick={() => setCreating(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Nueva conexión
          </Button>
        </EmptyHero>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          {/* Lista */}
          <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
            <div className="overflow-hidden surface rounded-2xl">
              <ul className="divide-y divide-border">
                {endpoints.map((ep) => {
                  const active = ep.id === selected?.id
                  return (
                    <li key={ep.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(ep.id)}
                        aria-current={active ? 'true' : undefined}
                        className={cn(
                          'relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                          active ? 'bg-accent/60' : 'hover:bg-accent/40'
                        )}
                      >
                        {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-primary" aria-hidden />}
                        <span
                          className={cn(
                            'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
                            active ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                          )}
                        >
                          {endpointMark(ep.name)}
                          <span
                            className={cn(
                              'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card',
                              ep.enabled ? 'bg-success' : 'bg-muted-foreground'
                            )}
                            aria-label={ep.enabled ? 'Activo' : 'Pausado'}
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn('block truncate text-sm font-medium', ep.enabled ? 'text-foreground' : 'text-muted-foreground')}>
                            {ep.name}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {!ep.enabled
                              ? 'Pausado'
                              : ep.lastReceivedAt
                                ? `${ep.receivedCount} · ${relativeTime(ep.lastReceivedAt)}`
                                : 'Sin actividad'}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1 text-muted-foreground/70">
                          {!ep.popup && <BellOff className="h-3.5 w-3.5" aria-label="Sin aviso" />}
                          {ep.popup && !ep.sound && <VolumeX className="h-3.5 w-3.5" aria-label="Sin sonido" />}
                          {ep.popup && ep.repeat && <Repeat className="h-3.5 w-3.5" aria-label="Repite el aviso" />}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
            <p className="flex items-start gap-2 px-1 text-[11px] leading-relaxed text-muted-foreground">
              {mode === 'cloud' ? (
                <Server className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : (
                <Database className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              {mode === 'cloud'
                ? 'En el servidor: reciben aunque la app esté cerrada.'
                : 'En este equipo (SQLite): la app debe estar abierta o en la bandeja.'}
            </p>
          </aside>

          {/* Detalle */}
          {selected && (
            <EndpointDetail
              key={selected.id}
              endpoint={selected}
              baseUrl={baseUrl}
              hostPicker={hostPicker}
              presetHint={presetHints[selected.id]}
              onDeleted={() => setSelectedId(null)}
            />
          )}
        </div>
      )}

      <NewEndpointDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(ep, presetId) => {
          setPresetHints((h) => ({ ...h, [ep.id]: presetId }))
          setSelectedId(ep.id)
        }}
      />
    </div>
  )
}

function EmptyHero({
  icon: Icon,
  title,
  text,
  children,
}: {
  icon: typeof Webhook
  title: string
  text: string
  children?: React.ReactNode
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-dashed border-border px-6 py-14 text-center">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,var(--color-primary)_0%,transparent_60%)] opacity-[0.06]"
        aria-hidden
      />
      <div className="relative mx-auto flex max-w-md flex-col items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-primary to-primary/65 text-primary-foreground shadow-lg shadow-primary/25">
          <Icon className="h-6 w-6" />
        </span>
        <div className="space-y-1.5">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{text}</p>
        </div>
        {children}
      </div>
    </div>
  )
}
