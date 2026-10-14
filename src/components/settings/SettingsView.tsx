import {
  Settings,
  Bell,
  Volume2,
  Calendar,
  Moon,
  Sun,
  Shield,
  Laptop,
  CheckCircle2,
  Palette,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { AccentPicker } from '@/components/settings/AccentPicker'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'

export function SettingsView() {
  const { settings, updateSettings, triggerNotificationTest } = useApp()

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" />
          Configuración del Sistema
        </h1>
        <p className="text-sm text-muted-foreground">
          Personaliza el comportamiento del receptor de webhooks, alertas de audio, visualización y sincronización.
        </p>
      </div>

      <div className="grid gap-6">
        {/* Notificaciones & Audio */}
        <Card className="border-border/80">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">Notificaciones & Alertas</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Gestiona cómo te avisa la aplicación al recibir nuevos eventos JSON en segundo plano.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Desktop notifications */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                  Notificaciones de Escritorio (Tauri / PC)
                </span>
                <p className="text-xs text-muted-foreground max-w-md">
                  Muestra alertas emergentes nativas en el centro de notificaciones de Windows al recibir un webhook.
                </p>
              </div>
              <Switch
                checked={settings.desktopNotificationsEnabled}
                onCheckedChange={(val) => updateSettings({ desktopNotificationsEnabled: val })}
              />
            </div>

            {/* Audio chimes */}
            <div className="flex items-center justify-between pt-4 border-t border-border/60">
              <div className="space-y-0.5">
                <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-success" />
                  Efectos de Sonido Sintetizados
                </span>
                <p className="text-xs text-muted-foreground max-w-md">
                  Emite un timbre sonoro agradable adaptado a la severidad del evento (éxito, alerta, error o cita).
                </p>
              </div>
              <Switch
                checked={settings.soundEnabled}
                onCheckedChange={(val) => updateSettings({ soundEnabled: val })}
              />
            </div>

            {/* Test button */}
            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={triggerNotificationTest}
                className="gap-2 text-xs"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                <span>Probar Notificación y Sonido Ahora</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Sincronización Calendario */}
        <Card className="border-border/80">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">Sincronización Inteligente de Calendario</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Mapeo automático entre eventos recibidos por webhook y el calendario interactivo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-sm font-semibold text-foreground">
                  Agendar Automáticamente Webhooks con Fecha
                </span>
                <p className="text-xs text-muted-foreground max-w-md">
                  Cuando un payload JSON contiene la propiedad <code>&quot;date&quot;</code> o <code>&quot;type&quot;: &quot;calendar&quot;</code>,
                  se registra de inmediato en la cuadrícula de tu calendario.
                </p>
              </div>
              <Switch
                checked={settings.autoCalendarSync}
                onCheckedChange={(val) => updateSettings({ autoCalendarSync: val })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Apariencia */}
        <Card className="border-border/80">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">Apariencia</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Elige el modo y el color principal de botones, selección y enlaces.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <span className="text-sm font-semibold text-foreground">Modo</span>
              <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
                {[
                  { id: 'light' as const, label: 'Claro', icon: Sun },
                  { id: 'dark' as const, label: 'Oscuro', icon: Moon },
                ].map((m) => {
                  const Icon = m.icon
                  const active = settings.theme === m.id
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => updateSettings({ theme: m.id })}
                      className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        active ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {m.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-3 pt-5 border-t border-border/60">
              <div className="space-y-0.5">
                <span className="text-sm font-semibold text-foreground">Color principal</span>
                <p className="text-xs text-muted-foreground">
                  Blanco y negro por defecto. Elige uno de los 6 colores o el tuyo propio.
                </p>
              </div>
              <AccentPicker />
            </div>
          </CardContent>
        </Card>

        {/* Información Técnica y Tauri */}
        <Card className="border-border/80 bg-muted/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Laptop className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">Entorno y Arquitectura</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
            <div className="p-3 rounded-lg border border-border/80 bg-card/60">
              <span className="text-muted-foreground block text-[11px]">Framework de Escritorio:</span>
              <span className="text-foreground font-semibold">Tauri v2 (Rust Core + Webview2)</span>
            </div>
            <div className="p-3 rounded-lg border border-border/80 bg-card/60">
              <span className="text-muted-foreground block text-[11px]">Frontend Stack:</span>
              <span className="text-foreground font-semibold">React 19, Tailwind CSS & shadcn/ui</span>
            </div>
            <div className="p-3 rounded-lg border border-border/80 bg-card/60">
              <span className="text-muted-foreground block text-[11px]">Puertos de Escucha:</span>
              <span className="text-primary font-semibold">5173 (/api/webhook) & 3690 (/webhook)</span>
            </div>
            <div className="p-3 rounded-lg border border-border/80 bg-card/60">
              <span className="text-muted-foreground block text-[11px]">Seguridad & Integridad:</span>
              <span className="text-success font-semibold flex items-center gap-1">
                <Shield className="h-3 w-3" /> CORS Habilitado / Sanitizado
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
