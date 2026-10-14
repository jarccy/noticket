import { Bell, Sparkles, Send, Sun, Moon, Radio, ShieldCheck } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export function Header() {
  const {
    settings,
    updateSettings,
    unreadCount,
    isGatewayOnline,
    triggerNotificationTest,
    setOpenSimulator,
    setActiveTab,
  } = useApp()

  const toggleTheme = () => {
    updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-background/80 backdrop-blur-xl transition-colors">
      <div className="flex h-16 items-center justify-between px-6">
        {/* Brand & Status */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Radio className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-foreground text-lg">PulseDesk</span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground">
                Tauri PC
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="relative inline-flex h-2 w-2">
                {isGatewayOnline && (
                  <span className="absolute inset-0 rounded-full bg-success opacity-60 animate-ping-slow" />
                )}
                <span className={`relative inline-block h-2 w-2 rounded-full ${isGatewayOnline ? 'bg-success' : 'bg-warning'}`} />
              </span>
              {isGatewayOnline ? 'Gateway Webhook Activo (Puertos 5173 & 3690)' : 'Modo Local / Conectando Gateway'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          {/* Quick simulator modal button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpenSimulator(true)}
            className="hidden sm:inline-flex items-center gap-2"
          >
            <Send className="h-3.5 w-3.5" />
            <span>Simulador Webhook</span>
          </Button>

          {/* Test native notification */}
          <Button
            variant="ghost"
            size="sm"
            onClick={triggerNotificationTest}
            title="Probar sonido y notificación de escritorio"
            className="hidden md:inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Test Notificación</span>
          </Button>

          {/* Unread Notifications Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setActiveTab('webhooks')}
            className="relative h-9 w-9 rounded-lg"
            title="Ver notificaciones y webhooks"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground ring-2 ring-background">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>

          {/* Theme Switcher */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground"
            title={`Cambiar a modo ${settings.theme === 'dark' ? 'claro' : 'oscuro'}`}
          >
            {settings.theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          {/* Verified System Icon */}
          <div className="hidden lg:flex items-center gap-1.5 pl-2 border-l border-border text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-success" />
            <span>Seguro</span>
          </div>
        </div>
      </div>
    </header>
  )
}
