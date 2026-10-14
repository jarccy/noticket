import { useState } from 'react'
import { Send, Sparkles, CheckCircle2, AlertTriangle, Calendar, XCircle, Code2 } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

const PRESETS = [
  {
    id: 'deploy',
    name: 'CI/CD Deploy',
    icon: CheckCircle2,
    color: 'text-success',
    payload: {
      title: 'Despliegue a Producción Completado',
      message: 'Release v3.4.1 desplegado con éxito en el clúster AWS us-east-1.',
      type: 'success',
      source: 'GitHub Actions',
      environment: 'production',
      buildNumber: 849,
      duration: '3m 45s',
    },
  },
  {
    id: 'calendar',
    name: 'Evento Calendario',
    icon: Calendar,
    color: 'text-primary',
    payload: {
      title: 'Reunión de Alineación de Arquitectura',
      message: 'Discusión de microservicios y sincronización de contratos API.',
      type: 'calendar',
      date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      time: '14:30',
      category: 'Reunión',
      source: 'Google Meet',
    },
  },
  {
    id: 'warning',
    name: 'Alerta Servidor',
    icon: AlertTriangle,
    color: 'text-warning',
    payload: {
      title: 'Alerta de Rendimiento: CPU > 88%',
      message: 'El nodo worker-k8s-04 superó el umbral crítico de utilización durante 5 min.',
      type: 'warning',
      source: 'Prometheus Alertmanager',
      threshold: '85%',
      severity: 'high',
    },
  },
  {
    id: 'error',
    name: 'Fallo de Pago',
    icon: XCircle,
    color: 'text-destructive',
    payload: {
      title: 'Fallo al procesar Factura #INV-2026',
      message: 'La tarjeta asociada al cliente rechazó el cobro recurrente por fondos insuficientes.',
      type: 'error',
      source: 'Stripe Webhooks',
      amount: 450,
      currency: 'EUR',
    },
  },
]

export function WebhookSimulatorModal() {
  const { openSimulator, setOpenSimulator, addWebhookEvent } = useApp()
  const [jsonText, setJsonText] = useState<string>(() => JSON.stringify(PRESETS[0].payload, null, 2))
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [selectedPreset, setSelectedPreset] = useState<string>('deploy')
  const [isSending, setIsSending] = useState(false)

  const handleSelectPreset = (preset: (typeof PRESETS)[0]) => {
    setSelectedPreset(preset.id)
    setJsonText(JSON.stringify(preset.payload, null, 2))
    setErrorMsg(null)
  }

  const handleSend = async () => {
    setErrorMsg(null)
    try {
      const parsed = JSON.parse(jsonText)
      setIsSending(true)
      await addWebhookEvent(parsed)
      setIsSending(false)
      setOpenSimulator(false)
    } catch (e) {
      setErrorMsg('Error de sintaxis JSON: ' + (e as Error).message)
      setIsSending(false)
    }
  }

  return (
    <Dialog open={openSimulator} onOpenChange={setOpenSimulator}>
      <DialogContent onClose={() => setOpenSimulator(false)} className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Simulador de Webhooks JSON
          </DialogTitle>
          <DialogDescription>
            Prueba cómo reacciona PulseDesk enviando cualquier payload JSON al receptor local.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Preset Buttons */}
          <div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
              Plantillas Rápidas
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PRESETS.map((p) => {
                const Icon = p.icon
                const isActive = selectedPreset === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectPreset(p)}
                    className={`flex items-center gap-1.5 p-2 rounded-lg text-xs font-medium border text-left transition-all ${
                      isActive
                        ? 'border-primary bg-primary/10 text-primary font-semibold shadow-xs'
                        : 'border-border bg-card/60 hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${p.color}`} />
                    <span className="truncate">{p.name}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* JSON Editor Textarea */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Code2 className="h-3.5 w-3.5 text-primary" />
                Cuerpo JSON del Webhook
              </label>
              <span className="text-[11px] font-mono text-muted-foreground">Content-Type: application/json</span>
            </div>

            <textarea
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value)
                setErrorMsg(null)
              }}
              rows={8}
              spellCheck={false}
              className="w-full rounded-lg border border-border bg-code p-3 font-mono text-xs text-code-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />

            {errorMsg && (
              <p className="text-xs text-destructive font-medium flex items-center gap-1 pt-1">
                <XCircle className="h-3.5 w-3.5" />
                {errorMsg}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" size="sm" onClick={() => setOpenSimulator(false)}>
            Cerrar
          </Button>
          <Button
            size="sm"
            onClick={handleSend}
            disabled={isSending}
            className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Send className="h-3.5 w-3.5" />
            <span>{isSending ? 'Enviando...' : 'Emitir Webhook'}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
