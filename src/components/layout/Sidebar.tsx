import { useState } from 'react'
import {
  LayoutDashboard,
  CalendarDays,
  Webhook,
  Settings,
  Copy,
  Check,
  Radio,
  Send,
  BellRing,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { AccountPanel } from '@/components/layout/AccountPanel'
import { isTauri, WEBHOOK_ENDPOINT } from '@/lib/platform'
import { cn } from '@/lib/utils'

type Tab = ReturnType<typeof useApp>['activeTab']

const COLLAPSE_KEY = 'noticket_sidebar_collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground active:scale-95"
    >
      {children}
    </button>
  )
}

export function Sidebar() {
  const {
    activeTab,
    setActiveTab,
    calendarEvents,
    events,
    unreadCount,
    isGatewayOnline,
    mode,
    settings,
    updateSettings,
    setOpenSimulator,
    triggerNotificationTest,
  } = useApp()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [copied, setCopied] = useState(false)

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1')
      } catch {
        // ignore
      }
      return !c
    })
  }

  const copyEndpoint = () => {
    navigator.clipboard.writeText(WEBHOOK_ENDPOINT)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const nav: { id: Tab; label: string; icon: LucideIcon; count?: number; highlight?: boolean }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'calendar', label: 'Calendario', icon: CalendarDays, count: calendarEvents.length || undefined },
    {
      id: 'webhooks',
      label: 'Webhooks & Logs',
      icon: Webhook,
      count: unreadCount || events.length || undefined,
      highlight: unreadCount > 0,
    },
    { id: 'settings', label: 'Configuración', icon: Settings },
  ]

  return (
    <aside
      className={cn(
        'flex h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out',
        collapsed ? 'w-[68px]' : 'w-60'
      )}
    >
      {/* Brand + gateway status */}
      <div className={cn('flex h-16 items-center gap-3 px-4', collapsed && 'justify-center px-0')}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Radio className="h-[18px] w-[18px]" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight text-foreground">PulseDesk</p>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={cn('h-1.5 w-1.5 rounded-full', isGatewayOnline ? 'bg-success' : 'bg-warning')} />
              {isGatewayOnline ? 'Escuchando en :3690' : mode === 'local' && !isTauri() ? 'Modo local' : 'Gateway desconectado'}
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 px-3 pt-2" aria-label="Principal">
        {nav.map((item) => {
          const Icon = item.icon
          const active = activeTab === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              title={collapsed ? item.label : undefined}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors',
                collapsed && 'justify-center px-0',
                active
                  ? 'bg-sidebar-accent font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground'
              )}
            >
              {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-primary" aria-hidden />}
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="flex-1 truncate text-left">{item.label}</span>}
              {!collapsed && item.count !== undefined && (
                <span
                  className={cn(
                    'min-w-5 rounded-full px-1.5 text-center text-[11px] font-medium tabular-nums leading-5',
                    item.highlight ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                  )}
                >
                  {item.count > 99 ? '99+' : item.count}
                </span>
              )}
              {collapsed && item.highlight && (
                <span className="absolute right-3 top-2 h-2 w-2 rounded-full bg-primary ring-2 ring-sidebar" aria-hidden />
              )}
            </button>
          )
        })}
      </nav>

      {/* Endpoint */}
      {!collapsed && (
        <div className="mx-3 mt-6 space-y-1.5">
          <p className="px-1 text-[11px] font-medium text-muted-foreground">Endpoint</p>
          <button
            type="button"
            onClick={copyEndpoint}
            title="Copiar endpoint"
            className="group flex w-full items-center gap-2 rounded-lg border border-sidebar-border bg-card px-2.5 py-2 text-left font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="flex-1 truncate">{WEBHOOK_ENDPOINT.replace('http://', '')}</span>
            {copied ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-success" />
            ) : (
              <Copy className="h-3.5 w-3.5 shrink-0 opacity-60 group-hover:opacity-100" />
            )}
          </button>
        </div>
      )}

      <div className="flex-1" />

      {/* Actions */}
      <div className={cn('space-y-2 border-t border-sidebar-border p-3', collapsed && 'flex flex-col items-center')}>
        <button
          type="button"
          onClick={() => setOpenSimulator(true)}
          title="Enviar webhook"
          className={cn(
            'flex h-9 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:scale-[0.98]',
            collapsed ? 'w-9' : 'w-full'
          )}
        >
          <Send className="h-4 w-4" />
          {!collapsed && 'Enviar webhook'}
        </button>
        <div className={cn('flex items-center', collapsed ? 'flex-col gap-1' : 'justify-between')}>
          <IconAction label="Probar notificación" onClick={triggerNotificationTest}>
            <BellRing className="h-4 w-4" />
          </IconAction>
          <IconAction
            label={settings.theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
            onClick={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
          >
            {settings.theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </IconAction>
          <IconAction label={collapsed ? 'Expandir menú' : 'Contraer menú'} onClick={toggleCollapsed}>
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </IconAction>
        </div>
      </div>

      {/* Account / sync */}
      <AccountPanel collapsed={collapsed} />
    </aside>
  )
}
