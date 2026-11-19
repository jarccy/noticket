import { useEffect, useState } from 'react'
import { Power } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { getAutostart, setAutostart } from '@/lib/autostart'

/** «Iniciar con Windows»: la app arranca minimizada en la bandeja al encender el equipo. */
export function AutostartSetting() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getAutostart().then(setEnabled)
  }, [])

  const toggle = async (on: boolean) => {
    setError(null)
    setEnabled(on)
    try {
      await setAutostart(on)
    } catch (err) {
      setEnabled(!on)
      setError(`No se pudo cambiar: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-4">
      <div className="space-y-0.5">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Power className="h-4 w-4 text-primary" />
          Iniciar con Windows
        </span>
        <p className="max-w-md text-xs text-muted-foreground">
          Al encender el equipo, PulseDesk se abre sola y se queda en la bandeja (junto al reloj), lista para
          avisarte. No hace falta abrirla.
        </p>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <Switch checked={!!enabled} disabled={enabled === null} onCheckedChange={toggle} />
    </div>
  )
}
