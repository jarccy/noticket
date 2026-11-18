import { useEffect, useState } from 'react'
import {
  House,
  Bell,
  CalendarDays,
  Settings,
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
  Plug,
  type LucideIcon,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { canManageGroups } from '@/lib/auth'
import { AccountPanel } from '@/components/layout/AccountPanel'
import { isTauri } from '@/lib/platform'
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
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-card hover:text-foreground hover:shadow-sm active:scale-95"
    >
      {children}
    </button>
  )
}

/** Marca: degradado de la marca con un anillo que «emite» como una señal. */
function BrandMark({ small }: { small?: boolean }) {
  return (
    <div className={cn('relative shrink-0', small ? 'h-8 w-8' : 'h-10 w-10')}>
      <span
        className={cn('absolute inset-0 animate-signal border-2 border-primary/60', small ? 'rounded-xl' : 'rounded-[14px]')}
        aria-hidden
      />
      <div
        className={cn(
          'relative flex h-full w-full items-center justify-center bg-brand text-primary-foreground glow-primary ring-1 ring-inset ring-white/20',
          small ? 'rounded-xl' : 'rounded-[14px]'
        )}
      >
        <Radio className={small ? 'h-4 w-4' : 'h-5 w-5'} strokeWidth={2.25} />
      </div>
    </div>
  )
}

function useNavItems() {
  const { calendarEvents, unreadCount, mode, endpoints } = useApp()
  const { user } = useAuth()
  const items: { id: Tab; label: string; hint: string; icon: LucideIcon; count?: number; highlight?: boolean }[] = [
    { id: 'dashboard', label: 'Inicio', hint: 'Resumen de tus avisos y lo próximo en tu agenda', icon: House },
    {
      id: 'webhooks',
      label: 'Notificaciones',
      hint: unreadCount > 0 ? `Tienes ${unreadCount} sin ver` : 'Todos los avisos que has recibido',
      icon: Bell,
      count: unreadCount || undefined,
      highlight: unreadCount > 0,
    },
    {
      id: 'endpoints',
      label: 'Conexiones',
      hint: 'Las apps y servicios que te envían avisos',
      icon: Plug,
      count: endpoints.length || undefined,
    },
    {
      id: 'calendar',
      label: 'Calendario',
      hint: 'Citas y recordatorios',
      icon: CalendarDays,
      count: calendarEvents.length || undefined,
    },
    // Solo boss y admin (con sesión) gestionan grupos
    ...(mode === 'cloud' && canManageGroups(user)
      ? [{ id: 'groups' as const, label: 'Grupos', hint: 'Personas a las que avisar a la vez', icon: UsersRound }]
      : []),
    { id: 'settings', label: 'Ajustes', hint: 'Sonido, avisos, calendario y apariencia', icon: Settings },
  ]
  return items
}

function useGatewayState() {
  const { isGatewayOnline } = useApp()
  const { user } = useAuth()
  // Sin sesión: en el escritorio la app recibe webhooks directamente (modo local)
  const localListening = !user && isTauri() && isGatewayOnline
  const online = (!!user && isGatewayOnline) || localListening
  const label = !user
    ? localListening
      ? 'Recibiendo en este equipo'
      : 'Sin iniciar sesión'
    : isGatewayOnline
      ? 'Recibiendo avisos'
      : 'Sin conexión'
  const tone: 'online' | 'idle' | 'offline' = online ? 'online' : !user ? 'idle' : 'offline'
  return { label, tone }
}

function StatusDot({ tone }: { tone: 'online' | 'idle' | 'offline' }) {
  return (
    <span className="relative flex h-1.5 w-1.5 shrink-0">
      {tone === 'online' && <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-60" />}
      <span
        className={cn(
          'relative h-1.5 w-1.5 rounded-full',
          tone === 'online' ? 'bg-success' : tone === 'idle' ? 'bg-muted-foreground/60' : 'bg-warning'
        )}
      />
    </span>
  )
}

function GatewayStatus() {
  const { label, tone } = useGatewayState()
  return (
    <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <StatusDot tone={tone} />
      <span className="truncate">{label}</span>
    </p>
  )
}

/**
 * Contenido del menú. En escritorio vive en el panel flotante (contraíble); en móvil y
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
      <div className={cn('flex h-16 shrink-0 items-center gap-3 px-3.5', collapsed && 'justify-center px-0')}>
        <BrandMark />
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[17px] font-bold leading-tight tracking-tight text-foreground">
              Pulse<span className="text-brand">Desk</span>
            </p>
            <GatewayStatus />
          </div>
        )}
        {onClose && (
          <IconAction label="Cerrar menú" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconAction>
        )}
      </div>

      <div className={cn('mx-4 h-px bg-linear-to-r from-transparent via-sidebar-border to-transparent', collapsed && 'mx-3')} />

      <div className="flex min-h-0 flex-col overflow-y-auto">
        {/* Navigation */}
        <nav className={cn('flex flex-col gap-0.5 px-3 pt-3', collapsed && 'items-center')} aria-label="Principal">
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
                title={collapsed ? `${item.label}: ${item.hint}` : item.hint}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex h-10 items-center gap-3 rounded-xl px-1.5 text-sm transition-all duration-200',
                  collapsed ? 'w-10 justify-center px-0' : 'w-full',
                  active
                    ? 'bg-linear-to-r from-primary/16 via-primary/7 to-transparent font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-foreground/[0.045] hover:text-foreground'
                )}
              >
                {/* Indicador luminoso del elemento activo */}
                {active && !collapsed && (
                  <span className="absolute -left-3 top-2 bottom-2 w-1 rounded-r-full bg-brand glow-primary" aria-hidden />
                )}
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all duration-200',
                    active
                      ? 'bg-brand text-primary-foreground glow-primary'
                      : 'bg-foreground/[0.04] group-hover:bg-foreground/[0.07] group-hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                {!collapsed && <span className="flex-1 truncate text-left">{item.label}</span>}
                {!collapsed && item.count !== undefined && (
                  <span
                    className={cn(
                      'mr-1.5 min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold tabular-nums leading-5',
                      item.highlight
                        ? 'bg-brand text-primary-foreground glow-primary'
                        : 'bg-foreground/[0.06] text-muted-foreground'
                    )}
                  >
                    {item.count > 99 ? '99+' : item.count}
                  </span>
                )}
                {collapsed && item.highlight && (
                  <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-sidebar" aria-hidden />
                )}
              </button>
            )
          })}
        </nav>

        <div className="h-3 shrink-0" />

        {/* Actions */}
        <div className={cn('space-y-2 px-3 pb-3', collapsed && 'flex flex-col items-center')}>
          {user && (
            <button
              type="button"
              onClick={() => {
                setOpenSimulator(true)
                onNavigate?.()
              }}
              title="Crear un aviso de prueba para ver cómo se muestra"
              className={cn(
                'group relative flex h-10 items-center justify-center gap-2 overflow-hidden rounded-xl bg-brand text-sm font-semibold text-primary-foreground glow-primary transition-all hover:brightness-110 active:scale-[0.98]',
                collapsed ? 'w-10' : 'w-full'
              )}
            >
              <span
                className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full"
                aria-hidden
              />
              <Send className="h-4 w-4" />
              {!collapsed && 'Enviar aviso de prueba'}
            </button>
          )}
          <div
            className={cn(
              'flex items-center rounded-2xl bg-foreground/[0.04] p-1',
              collapsed ? 'flex-col gap-1' : 'justify-around'
            )}
          >
            <IconAction label="Probar cómo suena y se ve un aviso" onClick={triggerNotificationTest}>
              <BellRing className="h-4 w-4" />
            </IconAction>
            <IconAction
              label={settings.theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
              onClick={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
            >
              {settings.theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </IconAction>
            {onToggleCollapsed && (
              <IconAction label={collapsed ? 'Mostrar el menú completo' : 'Hacer el menú más estrecho'} onClick={onToggleCollapsed}>
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
      {/* Mobile / tablet: barra superior flotante */}
      <div className="shrink-0 px-3 pt-3 lg:hidden">
        <header className="glass-float flex h-14 items-center gap-2.5 rounded-2xl px-2">
          <button
            type="button"
            data-testid="open-menu"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menú"
            aria-expanded={mobileOpen}
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-foreground/[0.05] active:scale-95"
          >
            <Menu className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary ring-2 ring-sidebar" aria-hidden />
            )}
          </button>
          <BrandMark small />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate font-display text-sm font-bold tracking-tight text-foreground">{current}</p>
            <GatewayStatus />
          </div>
          {user && (
            <button
              type="button"
              onClick={() => setOpenSimulator(true)}
              aria-label="Enviar aviso de prueba"
              title="Enviar aviso de prueba"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-primary-foreground glow-primary transition-all active:scale-95"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </header>
      </div>

      {/* Mobile / tablet: panel deslizante flotante */}
      <div className={cn('fixed inset-0 z-40 lg:hidden', !mobileOpen && 'pointer-events-none')}>
        <div
          className={cn(
            'absolute inset-0 bg-zinc-950/40 backdrop-blur-sm transition-opacity duration-200',
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
            'glass-float absolute inset-y-3 left-3 flex w-[min(18rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[1.75rem] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
            mobileOpen ? 'translate-x-0' : '-translate-x-[calc(100%+1rem)]'
          )}
        >
          <SidebarBody collapsed={false} onNavigate={() => setMobileOpen(false)} onClose={() => setMobileOpen(false)} />
        </aside>
      </div>

      {/* Desktop: panel flotante */}
      <aside
        className={cn(
          'glass-float relative my-3 ml-3 hidden max-h-[calc(100dvh-1.5rem)] shrink-0 flex-col self-center overflow-hidden rounded-3xl transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] lg:flex',
          collapsed ? 'w-[68px]' : 'w-60'
        )}
      >
        {/* Brillo superior del cristal */}
        <span
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-32 bg-linear-to-b from-primary/10 to-transparent"
          aria-hidden
        />
        <SidebarBody collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      </aside>
    </>
  )
}
