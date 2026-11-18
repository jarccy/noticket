import { useState } from 'react'
import { BellRing } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { REPEAT_MAX, REPEAT_MIN, REPEAT_PRESETS, repeatLabel, validRepeatMinutes } from '@/lib/repeats'
import { cn } from '@/lib/utils'

/** «Repetir aviso»: el aviso vuelve cada N minutos mientras no se marque como visto. */
export function RepeatSetting({
  repeat,
  minutes,
  disabled,
  onRepeat,
  onMinutes,
}: {
  repeat: boolean
  minutes: number
  disabled: boolean
  onRepeat: (v: boolean) => void
  onMinutes: (v: number) => void
}) {
  const active = repeat && !disabled
  const [customText, setCustomText] = useState(REPEAT_PRESETS.includes(minutes) ? '' : String(minutes))
  const invalid = active && !validRepeatMinutes(minutes)

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border transition-colors',
        active ? 'border-primary/40' : 'border-border',
        disabled && 'opacity-50'
      )}
    >
      <div className={cn('flex items-center gap-3 p-3', active && 'bg-primary/5')}>
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          )}
        >
          <BellRing className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Repetir aviso</p>
          <p className="text-xs text-muted-foreground">
            {disabled
              ? 'Necesita el aviso emergente activado'
              : active
                ? `Vuelve a aparecer ${repeatLabel(validRepeatMinutes(minutes) ? minutes : 15)} hasta que lo marques como visto`
                : 'El aviso aparece una sola vez'}
          </p>
        </div>
        <Switch checked={repeat} onCheckedChange={onRepeat} disabled={disabled} />
      </div>

      {active && (
        <div className="flex animate-fade-in flex-wrap items-center gap-2 border-t border-primary/20 px-3 py-2.5">
          <span className="text-[11px] font-medium text-muted-foreground">Cada</span>
          <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="Intervalo">
            {REPEAT_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={minutes === m && !customText}
                onClick={() => {
                  onMinutes(m)
                  setCustomText('')
                }}
                className={cn(
                  'h-7 rounded-md px-2.5 text-xs font-medium tabular-nums transition-colors',
                  minutes === m && !customText
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {m < 60 ? `${m} min` : `${m / 60} h`}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            o
            <Input
              type="number"
              inputMode="numeric"
              min={REPEAT_MIN}
              max={REPEAT_MAX}
              value={customText}
              placeholder="otro"
              onChange={(e) => {
                setCustomText(e.target.value)
                if (e.target.value === '') return
                const n = Number(e.target.value)
                onMinutes(Number.isFinite(n) ? Math.round(n) : 0)
              }}
              aria-invalid={invalid}
              className={cn('h-7 w-20 text-xs tabular-nums', invalid && 'border-destructive focus-visible:ring-destructive')}
            />
            min
          </label>
          {invalid && <span className="text-[11px] text-destructive">Entre 1 y 1440 minutos</span>}
        </div>
      )}
    </div>
  )
}
