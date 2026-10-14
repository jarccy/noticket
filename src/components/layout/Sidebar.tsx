import { useState } from 'react'
import {
  LayoutDashboard,
  CalendarDays,
  Webhook,
  Settings,
  Copy,
  Check,
  Terminal,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { Badge } from '@/components/ui/badge'
import { WEBHOOK_ENDPOINT } from '@/lib/platform'

export function Sidebar() {
  const { activeTab, setActiveTab, events, calendarEvents, unreadCount, isGatewayOnline } = useApp()
  const [copied, setCopied] = useState(false)

  const webhookEndpoint = WEBHOOK_ENDPOINT

  const copyEndpoint = () => {
    navigator.clipboard.writeText(webhookEndpoint)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'calendar',
      label: 'Calendario',
      icon: CalendarDays,
      badge: calendarEvents.length > 0 ? calendarEvents.length : null,
      badgeColor: 'bg-muted text-muted-foreground',
    },
    {
      id: 'webhooks',
      label: 'Webhooks & Logs',
      icon: Webhook,
      badge: unreadCount > 0 ? unreadCount : events.length,
      badgeColor: unreadCount > 0 ? 'bg-primary text-primary-foreground font-bold' : 'bg-muted text-muted-foreground',
    },
    {
      id: 'settings',
      label: 'Configuración',
      icon: Settings,
      badge: null,
    },
  ] as const

  return (
    <aside className="w-64 shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col justify-between p-4 h-[calc(100vh-4rem)]">
      {/* Navigation Links */}
      <div className="space-y-6">
        <div>
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">
            Módulos Principales
          </p>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = activeTab === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 text-left ${
                    isActive
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground font-semibold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`h-4 w-4 ${isActive ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== null && (
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        isActive ? 'bg-sidebar-primary-foreground/15 text-sidebar-primary-foreground' : item.badgeColor
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Quick Webhook Info Card */}
        <div className="rounded-xl border border-sidebar-border bg-card p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5 text-primary" />
              Webhook Listener
            </span>
            <Badge variant={isGatewayOnline ? 'success' : 'warning'} className="text-[10px] px-1.5 py-0">
              {isGatewayOnline ? 'Online' : 'Offline'}
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground leading-tight">
            Escuchando peticiones HTTP POST de payloads JSON.
          </p>
          <div className="flex items-center gap-1 rounded-lg bg-background/80 border border-border/80 px-2 py-1.5 text-[11px] font-mono text-muted-foreground overflow-hidden">
            <span className="truncate flex-1 select-all">{webhookEndpoint}</span>
            <button
              onClick={copyEndpoint}
              className="hover:text-foreground transition-colors p-1"
              title="Copiar endpoint"
            >
              {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="pt-4 border-t border-border/70 space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Versión</span>
          <span className="font-mono text-[11px]">v1.0.0-tauri</span>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Puerto Secundario</span>
          <span className="font-mono text-[11px] text-foreground">3690</span>
        </div>
      </div>
    </aside>
  )
}
