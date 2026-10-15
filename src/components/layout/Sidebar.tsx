import { useEffect, useState } from 'react'
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
  UsersRound,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { canManageGroups } from '@/lib/auth'
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

function useNavItems() {
  const { calendarEvents, events, unreadCount, mode } = useApp()
  const { user } = useAuth()
  const items: { id: Tab; label: string; icon: LucideIcon; count?: number; highlight?: boolean }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'calendar', label: 'Calendario', icon: CalendarDays, count: calendarEvents.length || undefined },
    {
      id: 'webhooks',
      label: 'Webhooks & Logs',
      icon: Webhook,
      count: unreadCount || events.length || undefined,
      highlight: unreadCount > 0,
    },
    // Solo boss y admin (con sesión) gestionan grupos
    ...(mode === 'cloud' && canManageGroups(user) ? [{ id: 'groups' as const, label: 'Grupos', icon: UsersRound }] : []),
    { id: 'settings', label: 'Configuración', icon: Settings },
  ]
  return items
}

function GatewayStatus() {
  const { isGatewayOnline, mode } = useApp()
  return (
    <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', isGatewayOnline ? 'bg-success' : 'bg-warning')} />
      <span className="truncate">
        {isGatewayOnline
          ? isTauri()
            ? 'Escuchando en :3690'
            : 'Conectado'
          : mode === 'local' && !isTauri()
            ? 'Modo local'
            : 'Gateway desconectado'}
      </span>
    </p>
  )
}

/**
 * Contenido del menú. En escritorio vive en la barra lateral (contraíble); en móvil y
 * tablet, dentro del panel deslizante.
 */
function SidebarBody({
  collapsed,
  onNavigate,
  onToggleCollapsed,
  onClose,
}: {
  collapsed: boolean
  onNavigate?: () => void
  onToggleCollapsed?: () => void
  onClose?: () => void
}) {
  const { activeTab, setActiveTab, settings, updateSettings, setOpenSimulator, triggerNotificationTest } = useApp()
  const nav = useNavItems()
  const [copied, setCopied] = useState(false)

  const copyEndpoint = () => {
    navigator.clipboard.writeText(WEBHOOK_ENDPOINT)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <>
      {/* Brand + gateway status */}
      <div className={cn('flex h-16 shrink-0 items-center gap-3 px-4', collapsed && 'justify-center px-0')}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Radio className="h-[18px] w-[18px]" />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold tracking-tight text-foreground">PulseDesk</p>
            <GatewayStatus />
          </div>
        )}
        {onClose && (
          <IconAction label="Cerrar menú" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconAction>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* Navigation */}
        <nav className="flex flex-col gap-0.5 px-3 pt-2" aria-label="Principal">
          {nav.map((item) => {
            const Icon = item.icon
            const active = activeTab === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id)
                  onNavigate?.()
                }}
                title={collapsed ? item.label : undefined}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors lg:h-9',
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

        <div className="min-h-6 flex-1" />

        {/* Actions */}
        <div className={cn('space-y-2 border-t border-sidebar-border p-3', collapsed && 'flex flex-col items-center')}>
          <button
            type="button"
            onClick={() => {
              setOpenSimulator(true)
              onNavigate?.()
            }}
            title="Enviar webhook"
            className={cn(
              'flex h-10 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:scale-[0.98] lg:h-9',
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
            {onToggleCollapsed && (
              <IconAction label={collapsed ? 'Expandir menú' : 'Contraer menú'} onClick={onToggleCollapsed}>
                {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </IconAction>
            )}
          </div>
        </div>

        {/* Account / sync */}
        <AccountPanel collapsed={collapsed} />
      </div>
    </>
  )
}

export function Sidebar() {
  const { activeTab, unreadCount, setOpenSimulator } = useApp()
  const nav = useNavItems()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)

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

  // Mobile drawer: close with Escape
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  const current = nav.find((n) => n.id === activeTab)?.label ?? 'PulseDesk'

  return (
    <>
      {/* Mobile / tablet top bar */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border bg-sidebar px-2 lg:hidden">
        <button
          type="button"
          data-testid="open-menu"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menú"
          aria-expanded={mobileOpen}
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-sidebar-accent active:scale-95"
        >
          <Menu className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary ring-2 ring-sidebar" aria-hidden />
          )}
        </button>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Radio className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold tracking-tight text-foreground">{current}</p>
          <GatewayStatus />
        </div>
        <button
          type="button"
          onClick={() => setOpenSimulator(true)}
          aria-label="Enviar webhook"
          title="Enviar webhook"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 active:scale-95"
        >
          <Send className="h-4 w-4" />
        </button>
      </header>

      {/* Mobile / tablet drawer */}
      <div className={cn('fixed inset-0 z-40 lg:hidden', !mobileOpen && 'pointer-events-none')}>
        <div
          className={cn(
            'absolute inset-0 bg-zinc-950/50 backdrop-blur-[2px] transition-opacity duration-200',
            mobileOpen ? 'opacity-100' : 'opacity-0'
          )}
          onClick={() => setMobileOpen(false)}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Menú"
          inert={!mobileOpen}
          className={cn(
            'absolute inset-y-0 left-0 flex w-[min(18rem,85vw)] flex-col border-r border-sidebar-border bg-sidebar shadow-2xl transition-transform duration-200 ease-out',
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <SidebarBody collapsed={false} onNavigate={() => setMobileOpen(false)} onClose={() => setMobileOpen(false)} />
        </aside>
      </div>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out lg:flex',
          collapsed ? 'w-[68px]' : 'w-60'
        )}
      >
        <SidebarBody collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      </aside>
    </>
  )
}
