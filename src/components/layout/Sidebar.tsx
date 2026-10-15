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
  Link2,
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
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-card hover:text-foreground hover:shadow-sm active:scale-95"
    >
      {children}
    </button>
  )
}

function BrandMark({ small }: { small?: boolean }) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center bg-linear-to-br from-primary to-primary/65 text-primary-foreground shadow-md shadow-primary/25 ring-1 ring-inset ring-white/15',
        small ? 'h-7 w-7 rounded-lg' : 'h-9 w-9 rounded-xl'
      )}
    >
      <Radio className={small ? 'h-3.5 w-3.5' : 'h-[18px] w-[18px]'} />
    </div>
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
  const { isGatewayOnline } = useApp()
  const { user } = useAuth()
  // Sin sesión no se reciben webhooks externos: solo se trabaja en local
  const online = !!user && isGatewayOnline
  const label = !user ? 'Modo local' : isGatewayOnline ? (isTauri() ? 'Escuchando en :3690' : 'Conectado') : 'Sin conexión'
  return (
    <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        {online && <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-60" />}
        <span
          className={cn(
            'relative h-1.5 w-1.5 rounded-full',
            !user ? 'bg-muted-foreground/50' : isGatewayOnline ? 'bg-success' : 'bg-warning'
          )}
        />
      </span>
      <span className="truncate">{label}</span>
    </p>
  )
}

function EndpointCard() {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(WEBHOOK_ENDPOINT)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <div className="mx-3 mt-6 rounded-xl border border-sidebar-border bg-card p-2.5 shadow-sm">
      <p className="flex items-center gap-1.5 px-0.5 text-[11px] font-medium text-muted-foreground">
        <Link2 className="h-3.5 w-3.5" />
        Endpoint
      </p>
      <button
        type="button"
        onClick={copy}
        title="Copiar endpoint"
        className="group mt-1.5 flex w-full items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5 text-left font-mono text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <span className="flex-1 truncate">{WEBHOOK_ENDPOINT.replace('http://', '')}</span>
        {copied ? (
          <Check className="h-3.5 w-3.5 shrink-0 text-success" />
        ) : (
          <Copy className="h-3.5 w-3.5 shrink-0 opacity-60 group-hover:opacity-100" />
        )}
      </button>
    </div>
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
  const { user } = useAuth()
  const nav = useNavItems()

  return (
    <>
      {/* Brand + gateway status */}
      <div className={cn('flex h-16 shrink-0 items-center gap-3 px-4', collapsed && 'justify-center px-0')}>
        <BrandMark />
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
        {!collapsed && (
          <p className="px-5 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
            Menú
          </p>
        )}
        <nav className={cn('flex flex-col gap-1 px-3', collapsed && 'pt-2')} aria-label="Principal">
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
                  'group relative flex h-10 items-center gap-3 rounded-xl px-1.5 text-sm transition-all',
                  collapsed && 'justify-center px-0',
                  active
                    ? 'bg-card font-medium text-foreground shadow-sm ring-1 ring-sidebar-border'
                    : 'text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground'
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors',
                    active
                      ? 'bg-linear-to-br from-primary to-primary/70 text-primary-foreground shadow-sm shadow-primary/30'
                      : 'group-hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                {!collapsed && <span className="flex-1 truncate text-left">{item.label}</span>}
                {!collapsed && item.count !== undefined && (
                  <span
                    className={cn(
                      'mr-1 min-w-5 rounded-full px-1.5 text-center text-[11px] font-medium tabular-nums leading-5',
                      item.highlight ? 'bg-primary text-primary-foreground' : 'bg-sidebar-accent text-muted-foreground'
                    )}
                  >
                    {item.count > 99 ? '99+' : item.count}
                  </span>
                )}
                {collapsed && item.highlight && (
                  <span className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-sidebar" aria-hidden />
                )}
              </button>
            )
          })}
        </nav>

        {/* Endpoint: solo tiene sentido con sesión (sin ella no se aceptan webhooks externos) */}
        {user && !collapsed && <EndpointCard />}

        <div className="min-h-6 flex-1" />

        {/* Actions */}
        <div className={cn('space-y-2 p-3', collapsed && 'flex flex-col items-center')}>
          {user && (
            <button
              type="button"
              onClick={() => {
                setOpenSimulator(true)
                onNavigate?.()
              }}
              title="Enviar webhook"
              className={cn(
                'flex h-10 items-center justify-center gap-2 rounded-xl bg-linear-to-br from-primary to-primary/80 text-sm font-medium text-primary-foreground shadow-md shadow-primary/20 transition-all hover:shadow-lg hover:shadow-primary/30 active:scale-[0.98]',
                collapsed ? 'w-10' : 'w-full'
              )}
            >
              <Send className="h-4 w-4" />
              {!collapsed && 'Enviar webhook'}
            </button>
          )}
          <div
            className={cn(
              'flex items-center rounded-xl bg-sidebar-accent/60 p-1',
              collapsed ? 'flex-col gap-1' : 'justify-around'
            )}
          >
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
  const { activeTab, unreadCount, openSimulator, setOpenSimulator } = useApp()
  const { user } = useAuth()
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

  // Al cerrar sesión, cerrar el simulador si estaba abierto
  useEffect(() => {
    if (!user && openSimulator) setOpenSimulator(false)
  }, [user, openSimulator, setOpenSimulator])

  const current = nav.find((n) => n.id === activeTab)?.label ?? 'PulseDesk'

  return (
    <>
      {/* Mobile / tablet top bar */}
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border bg-sidebar/90 px-2 backdrop-blur lg:hidden">
        <button
          type="button"
          data-testid="open-menu"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menú"
          aria-expanded={mobileOpen}
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-sidebar-accent active:scale-95"
        >
          <Menu className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary ring-2 ring-sidebar" aria-hidden />
          )}
        </button>
        <BrandMark small />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold tracking-tight text-foreground">{current}</p>
          <GatewayStatus />
        </div>
        {user && (
          <button
            type="button"
            onClick={() => setOpenSimulator(true)}
            aria-label="Enviar webhook"
            title="Enviar webhook"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-primary to-primary/80 text-primary-foreground shadow-md shadow-primary/20 transition-all active:scale-95"
          >
            <Send className="h-4 w-4" />
          </button>
        )}
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
