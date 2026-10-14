import { useRef } from 'react'
import { Check, Pipette } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { ACCENT_PRESETS, MONO_ACCENT, isHexColor, readableOn } from '@/lib/accent'
import { cn } from '@/lib/utils'

const swatchBase =
  'relative h-10 w-10 rounded-full transition-transform duration-150 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card'

function SelectedRing({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        'pointer-events-none absolute -inset-1 rounded-full border-2 border-foreground transition-opacity',
        active ? 'opacity-100' : 'opacity-0'
      )}
    />
  )
}

export function AccentPicker() {
  const { settings, updateSettings } = useApp()
  const colorInputRef = useRef<HTMLInputElement>(null)
  const current = settings.accentColor
  const isCustom = isHexColor(current)
  const customColor = isCustom ? current : settings.customAccent

  const select = (value: string) => updateSettings({ accentColor: value })

  const currentLabel =
    current === MONO_ACCENT
      ? 'Blanco y negro'
      : ACCENT_PRESETS.find((p) => p.id === current)?.label ?? `Personalizado ${current.toUpperCase()}`

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Color principal" className="flex flex-wrap items-center gap-3">
        {/* Mono: split black / white */}
        <button
          type="button"
          role="radio"
          aria-checked={current === MONO_ACCENT}
          aria-label="Blanco y negro"
          title="Blanco y negro"
          onClick={() => select(MONO_ACCENT)}
          className={cn(swatchBase, 'overflow-visible border border-border')}
        >
          <span className="absolute inset-0 rounded-full bg-[linear-gradient(135deg,#18181b_50%,#fafafa_50%)]" />
          {current === MONO_ACCENT && (
            <Check className="absolute inset-0 m-auto h-4 w-4 text-zinc-50 mix-blend-difference" strokeWidth={2.5} />
          )}
          <SelectedRing active={current === MONO_ACCENT} />
        </button>

        <span className="h-6 w-px bg-border mx-1" aria-hidden />

        {ACCENT_PRESETS.map((p) => {
          const active = current === p.id
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={p.label}
              title={p.label}
              onClick={() => select(p.id)}
              className={swatchBase}
              style={{ backgroundColor: settings.theme === 'dark' ? p.dark : p.light }}
            >
              {active && (
                <Check
                  className="absolute inset-0 m-auto h-4 w-4"
                  strokeWidth={2.5}
                  style={{ color: readableOn(settings.theme === 'dark' ? p.dark : p.light) }}
                />
              )}
              <SelectedRing active={active} />
            </button>
          )
        })}

        <span className="h-6 w-px bg-border mx-1" aria-hidden />

        {/* Custom color */}
        <button
          type="button"
          role="radio"
          aria-checked={isCustom}
          aria-label="Color personalizado"
          title="Elegir color personalizado"
          onClick={() => {
            if (!isCustom) select(customColor)
            colorInputRef.current?.click()
          }}
          className={cn(swatchBase, 'border border-dashed', isCustom ? 'border-transparent' : 'border-muted-foreground/50')}
          style={isCustom ? { backgroundColor: customColor } : undefined}
        >
          <Pipette
            className="absolute inset-0 m-auto h-4 w-4"
            style={{ color: isCustom ? readableOn(customColor) : undefined }}
          />
          <SelectedRing active={isCustom} />
        </button>
        <input
          ref={colorInputRef}
          type="color"
          value={customColor}
          onChange={(e) => updateSettings({ accentColor: e.target.value, customAccent: e.target.value })}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
        <p className="text-xs text-muted-foreground">
          Color actual: <span className="font-semibold text-foreground">{currentLabel}</span>
        </p>
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
            Botón
          </span>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
            Etiqueta
          </span>
          <span className="text-xs font-semibold text-primary">Enlace</span>
        </div>
      </div>
    </div>
  )
}
