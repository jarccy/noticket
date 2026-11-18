import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Check, Copy, Eye, EyeOff, RefreshCw, Webhook } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Storage } from '@/services/storage'
import { WEBHOOK_ENDPOINT } from '@/lib/platform'

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 shrink-0"
      aria-label={label}
      title={label}
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  )
}

function Row({ label, value, copyLabel, mono = true }: { label: string; value: string; copyLabel: string; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 rounded-lg border border-border/80 bg-card/60 pl-3 pr-1 py-1">
        <span className={`flex-1 truncate text-xs text-foreground ${mono ? 'font-mono' : ''}`}>{value}</span>
        <CopyButton text={value} label={copyLabel} />
      </div>
    </div>
  )
}

/**
 * Modo local (sin backend): la app recibe webhooks directamente en el puerto 3690.
 * Desde este equipo no hace falta secreto; desde otros equipos de la red, sí.
 */
export function LocalWebhookCard() {
  const { isGatewayOnline } = useApp()
  const [urls, setUrls] = useState<string[]>([WEBHOOK_ENDPOINT])
  const [secret, setSecret] = useState(() => Storage.getLocalWebhookSecret())
  const [showSecret, setShowSecret] = useState(false)

  useEffect(() => {
    invoke<string[]>('local_webhook_urls')
      .then(setUrls)
      .catch(() => {})
  }, [])

  const regenerate = () => {
    const next = Storage.regenerateLocalWebhookSecret()
    setSecret(next)
    invoke('set_local_webhook_secret', { secret: next }).catch(() => {})
  }

  const [localUrl, lanUrl] = urls
  const example = `curl -X POST ${lanUrl ?? localUrl} \\\n  -H "Content-Type: application/json" \\\n  -H "x-webhook-secret: ${secret}" \\\n  -d '{"title":"Hola","message":"Webhook sin backend","type":"success"}'`

  return (
    <Card className="border-border/80">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Webhook className="h-5 w-5 text-primary" />
          <CardTitle className="text-base font-semibold">Recibir webhooks en esta app</CardTitle>
          <span
            className={`ml-auto text-[11px] font-medium ${isGatewayOnline ? 'text-success' : 'text-warning'}`}
          >
            {isGatewayOnline ? 'Escuchando' : 'Puerto 3690 ocupado'}
          </span>
        </div>
        <CardDescription className="text-xs">
          Envía webhooks directamente a esta app, con o sin sesión. Un programa de este equipo (curl, un
          script) puede usar la dirección local sin secreto; otros equipos, túneles y páginas web necesitan el
          secreto. Para cada servicio es mejor crear su propia conexión.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Row label="Desde este equipo" value={localUrl} copyLabel="Copiar dirección local" />
        {lanUrl ? (
          <Row label="Desde otros equipos de tu red" value={lanUrl} copyLabel="Copiar dirección de red" />
        ) : (
          <p className="text-xs text-muted-foreground">No se detectó una conexión de red: solo está disponible la dirección local.</p>
        )}

        <div className="space-y-1">
          <span className="text-[11px] text-muted-foreground">
            Secreto local (cabecera <code>x-webhook-secret</code>, <code>Authorization: Bearer</code> o <code>?secret=</code>)
          </span>
          <div className="flex items-center gap-1 rounded-lg border border-border/80 bg-card/60 pl-3 pr-1 py-1">
            <span className="flex-1 truncate font-mono text-xs text-foreground">
              {showSecret ? secret : '•'.repeat(24)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              aria-label={showSecret ? 'Ocultar secreto' : 'Mostrar secreto'}
              onClick={() => setShowSecret((v) => !v)}
            >
              {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
            <CopyButton text={secret} label="Copiar secreto" />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              aria-label="Generar un secreto nuevo"
              title="Generar un secreto nuevo (el anterior deja de valer)"
              onClick={regenerate}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">Ejemplo</span>
            <CopyButton text={example} label="Copiar ejemplo" />
          </div>
          <pre className="overflow-x-auto rounded-lg border border-border/80 bg-muted/40 p-3 text-[11px] leading-relaxed font-mono text-foreground">
            {example}
          </pre>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Si Windows pregunta por el firewall, permite el acceso en redes privadas. Para recibir webhooks desde
          internet (GitHub, Stripe…) expón el puerto con un túnel, p. ej. <code>cloudflared tunnel --url http://localhost:3690</code>.
        </p>
      </CardContent>
    </Card>
  )
}
