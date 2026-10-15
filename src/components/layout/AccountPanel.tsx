import { useState } from 'react'
import { CloudUpload, Check, HardDrive, Loader2, LogIn, LogOut, AlertCircle } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { roleLabel } from '@/components/groups/roles'
import { cn } from '@/lib/utils'

type SyncFeedback = { tone: 'ok' | 'error'; text: string } | null

/**
 * Pie del sidebar. Sin sesión: aviso de modo local y botón para iniciar sesión.
 * Con sesión: usuario, botón de sincronizar lo guardado en local y cerrar sesión.
 */
export function AccountPanel({ collapsed }: { collapsed: boolean }) {
  const { user, logout, openAuth } = useAuth()
  const { pendingSync, syncing, syncLocalData } = useApp()
  const [feedback, setFeedback] = useState<SyncFeedback>(null)

  const sync = async () => {
    setFeedback(null)
    try {
      const { uploaded, failed } = await syncLocalData()
      setFeedback(
        failed
          ? { tone: 'error', text: `${failed} sin subir. Reintenta más tarde.` }
          : { tone: 'ok', text: `${uploaded} ${uploaded === 1 ? 'elemento sincronizado' : 'elementos sincronizados'}` }
      )
    } catch (err) {
      setFeedback({ tone: 'error', text: (err as Error).message })
    }
    setTimeout(() => setFeedback(null), 4000)
  }

  if (!user) {
    if (collapsed) {
      return (
        <div className="flex justify-center border-t border-sidebar-border p-3">
          <button
            type="button"
            onClick={openAuth}
            title="Iniciar sesión"
            aria-label="Iniciar sesión"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-primary to-primary/80 text-primary-foreground shadow-md shadow-primary/20 transition-all active:scale-95"
          >
            <LogIn className="h-4 w-4" />
          </button>
        </div>
      )
    }
    return (
      <div className="p-3 pt-0">
        <div className="rounded-xl border border-sidebar-border bg-card p-3 shadow-sm">
          <div className="flex items-start gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <HardDrive className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">Modo local</p>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Inicia sesión para recibir webhooks y sincronizar tus datos.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openAuth}
            className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-linear-to-br from-primary to-primary/80 text-sm font-medium text-primary-foreground shadow-md shadow-primary/20 transition-all hover:shadow-lg hover:shadow-primary/30 active:scale-[0.98]"
          >
            <LogIn className="h-4 w-4" />
            Iniciar sesión
          </button>
        </div>
      </div>
    )
  }

  const showSync = pendingSync > 0 || syncing || feedback

  return (
    <div className={cn('space-y-2 p-3 pt-0', collapsed && 'flex flex-col items-center px-0')}>
      {showSync && (
        <button
          type="button"
          onClick={sync}
          disabled={syncing || pendingSync === 0}
          title={feedback?.text ?? `Subir a la base ${pendingSync} elementos guardados en este equipo`}
          className={cn(
            'flex h-9 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors active:scale-[0.98] disabled:cursor-default',
            collapsed ? 'w-9' : 'w-full',
            feedback?.tone === 'ok'
              ? 'bg-success/10 text-success'
              : feedback?.tone === 'error'
                ? 'bg-destructive/10 text-destructive'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
          )}
        >
          {syncing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : feedback?.tone === 'ok' ? (
            <Check className="h-4 w-4" />
          ) : feedback?.tone === 'error' ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <CloudUpload className="h-4 w-4" />
          )}
          {!collapsed && (
            <span className="truncate">
              {syncing ? 'Sincronizando…' : feedback ? feedback.text : `Sincronizar (${pendingSync})`}
            </span>
          )}
        </button>
      )}

      <div
        className={cn(
          'flex items-center gap-2.5',
          collapsed ? 'flex-col gap-1' : 'rounded-xl border border-sidebar-border bg-card p-2 shadow-sm'
        )}
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-primary/20"
          />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-primary to-primary/65 text-xs font-semibold uppercase text-primary-foreground ring-2 ring-primary/20">
            {(user.name || user.email).charAt(0)}
          </span>
        )}
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate text-xs font-semibold text-foreground">
              <span className="truncate">{user.name || user.email.split('@')[0]}</span>
              {user.userType && user.userType !== 'user' && (
                <span className="shrink-0 rounded-full bg-primary/10 px-1.5 text-[10px] font-medium leading-4 text-primary">
                  {roleLabel(user.userType)}
                </span>
              )}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
          </div>
        )}
        <button
          type="button"
          onClick={logout}
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive active:scale-95"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
