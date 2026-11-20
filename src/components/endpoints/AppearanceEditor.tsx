import { useRef } from 'react'
import { Check, Clock, Eye, Palette, Pipette, Shapes, Sparkles } from 'lucide-react'
import type { NotificationAppearance, WebhookEvent } from '@/types'
import { NotificationCard } from '@/components/notify/NotificationCard'
import { Switch } from '@/components/ui/switch'
import { COLOR_SWATCHES, DURATIONS, ICONS, STYLES } from '@/lib/notification-style'
import { cn } from '@/lib/utils'

/**
 * Diseño de los avisos de una conexión: estilo, color, icono, tiempo en pantalla y si se
 * muestran el origen y la hora. Cada cambio se ve al momento en la vista previa.
 */
export function AppearanceEditor({
  value,
  onChange,
  sample,
}: {
  value: NotificationAppearance
  onChange: (next: NotificationAppearance) => void
  /** Aviso de ejemplo (el del payload de prueba) para las miniaturas y la vista previa. */
  sample: WebhookEvent
}) {
  const colorRef = useRef<HTMLInputElement>(null)
  const set = <K extends keyof NotificationAppearance>(key: K, v: NotificationAppearance[K]) =>
    onChange({ ...value, [key]: v })
  const customColor = value.color && !COLOR_SWATCHES.includes(value.color) ? value.color : null

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        {/* Estilo */}
        <Section icon={Sparkles} title="Estilo">
          <div role="radiogroup" aria-label="Estilo del aviso" className="grid gap-2 sm:grid-cols-2">
            {STYLES.map((s) => {
              const active = value.style === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => set('style', s.id)}
                  className={cn(
                    'group relative overflow-hidden rounded-xl border p-2.5 text-left transition-all',
                    active
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:border-foreground/25 hover:bg-accent/40'
                  )}
                >
                  {/* Miniatura real del diseño */}
                  <div className="pointer-events-none mb-2 h-[58px] overflow-hidden rounded-lg bg-muted/50 p-1.5" aria-hidden>
                    <div className="w-[200%] origin-top-left scale-50">
                      <NotificationCard
                        event={sample}
                        appearance={{ ...value, style: s.id, duration: 0 }}
                        mode="preview"
                        className="shadow-none"
                      />
                    </div>
                  </div>
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground">{s.label}</span>
                    {active && <Check className="h-3.5 w-3.5 text-primary" />}
                  </span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">{s.description}</span>
                </button>
              )
            })}
          </div>
        </Section>

        {/* Color */}
        <Section icon={Palette} title="Color">
          <div role="radiogroup" aria-label="Color del aviso" className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              role="radio"
              aria-checked={value.color === null}
              onClick={() => set('color', null)}
              className={cn(
                'h-8 rounded-full border px-3 text-xs font-medium transition-colors',
                value.color === null
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground'
              )}
              title="Verde para éxito, ámbar para alertas, rojo para errores…"
            >
              Según el tipo
            </button>
            {COLOR_SWATCHES.map((c) => (
              <Swatch key={c} color={c} active={value.color === c} onClick={() => set('color', c)} />
            ))}
            <button
              type="button"
              onClick={() => colorRef.current?.click()}
              aria-label="Elegir otro color"
              title="Otro color"
              className={cn(
                'relative flex h-8 w-8 items-center justify-center rounded-full border transition-all',
                customColor ? 'ring-2 ring-primary ring-offset-2 ring-offset-card' : 'border-dashed border-border hover:border-foreground/40'
              )}
              style={customColor ? { backgroundColor: customColor } : undefined}
            >
              <Pipette className={cn('h-3.5 w-3.5', customColor ? 'text-white mix-blend-difference' : 'text-muted-foreground')} />
              <input
                ref={colorRef}
                type="color"
                value={value.color ?? '#2563eb'}
                onChange={(e) => set('color', e.target.value.toLowerCase())}
                className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
                tabIndex={-1}
                aria-hidden
              />
            </button>
          </div>
        </Section>

        {/* Icono */}
        <Section icon={Shapes} title="Icono">
          <div role="radiogroup" aria-label="Icono del aviso" className="flex flex-wrap gap-1.5">
            <button
              type="button"
              role="radio"
              aria-checked={value.icon === null}
              onClick={() => set('icon', null)}
              className={cn(
                'h-9 rounded-lg border px-3 text-xs font-medium transition-colors',
                value.icon === null
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground'
              )}
              title="Un check para éxito, un triángulo para alertas…"
            >
              Según el tipo
            </button>
            {ICONS.map(({ id, label, icon: Icon }) => {
              const active = value.icon === id
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={label}
                  title={label}
                  onClick={() => set('icon', id)}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-lg border transition-colors',
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                </button>
              )
            })}
          </div>
        </Section>

        {/* Tiempo y detalles */}
        <Section icon={Clock} title="Tiempo en pantalla">
          <div role="radiogroup" aria-label="Tiempo en pantalla" className="inline-flex flex-wrap items-center gap-0.5 rounded-lg bg-muted p-0.5">
            {DURATIONS.map((d) => (
              <button
                key={d.seconds}
                type="button"
                role="radio"
                aria-checked={value.duration === d.seconds}
                onClick={() => set('duration', d.seconds)}
                className={cn(
                  'h-7 rounded-md px-2.5 text-xs font-medium transition-colors',
                  value.duration === d.seconds
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {value.duration === 0
              ? 'El aviso se queda en pantalla hasta que lo cierres o lo marques como visto.'
              : 'Pasa el ratón por encima del aviso para que no se cierre mientras lo lees.'}
          </p>
        </Section>

        <label className="flex items-center justify-between gap-4 rounded-xl border border-border p-3">
          <span className="flex items-center gap-2.5">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <span>
              <span className="block text-sm font-medium text-foreground">Mostrar origen y hora</span>
              <span className="block text-xs text-muted-foreground">Quién lo envía y a qué hora llegó</span>
            </span>
          </span>
          <Switch checked={value.showMeta} onCheckedChange={(v) => set('showMeta', v)} />
        </label>
      </div>

      {/* Vista previa grande */}
      <div className="space-y-2 xl:sticky xl:top-4 xl:self-start">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Así se verá</span>
        <div className="rounded-2xl border border-dashed border-border bg-[radial-gradient(circle_at_1px_1px,var(--color-border)_1px,transparent_0)] bg-size-[14px_14px] p-4">
          <div className="ml-auto max-w-[396px]">
            <NotificationCard event={sample} appearance={value} mode="preview" onDismiss={() => {}} />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          En el escritorio aparece en la esquina inferior derecha de la pantalla.
        </p>
      </div>
    </div>
  )
}

function Section({ icon: Icon, title, children }: { icon: typeof Clock; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        {title}
      </span>
      {children}
    </div>
  )
}

function Swatch({ color, active, onClick }: { color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={color}
      title={color}
      onClick={onClick}
      className={cn(
        'relative flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-110',
        active && 'ring-2 ring-primary ring-offset-2 ring-offset-card'
      )}
      style={{ backgroundColor: color }}
    >
      {active && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
    </button>
  )
}
