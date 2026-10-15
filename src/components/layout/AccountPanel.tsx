import { useState } from 'react'
import { CloudUpload, Check, HardDrive, Loader2, LogIn, LogOut, AlertCircle } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
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
    return (
      <div className={cn('space-y-2 border-t border-sidebar-border p-3', collapsed && 'flex flex-col items-center')}>
        {!collapsed && (
          <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
            <HardDrive className="h-3.5 w-3.5 shrink-0" />
            Modo local · se guarda en este equipo
          </p>
        )}
        <button
          type="button"
          onClick={openAuth}
          title="Iniciar sesión"
          className={cn(
            'flex h-9 items-center justify-center gap-2 rounded-lg border border-sidebar-border bg-card text-sm font-medium text-foreground transition-colors hover:bg-sidebar-accent active:scale-[0.98]',
            collapsed ? 'w-9' : 'w-full'
          )}
        >
          <LogIn className="h-4 w-4" />
          {!collapsed && 'Iniciar sesión'}
        </button>
      </div>
    )
  }

  const showSync = pendingSync > 0 || syncing || feedback

  return (
    <div className={cn('space-y-2 border-t border-sidebar-border p-3', collapsed && 'flex flex-col items-center px-0')}>
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

      <div className={cn('flex items-center gap-2.5', collapsed && 'flex-col gap-1')}>
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" className="h-8 w-8 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold uppercase text-foreground">
            {(user.name || user.email).charAt(0)}
          </span>
        )}
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground">{user.name || user.email.split('@')[0]}</p>
            <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
          </div>
        )}
        <button
          type="button"
          onClick={logout}
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground active:scale-95"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
