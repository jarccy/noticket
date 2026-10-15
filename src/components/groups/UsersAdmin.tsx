import { useCallback, useEffect, useState } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { UsersApi } from '@/services/api'
import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/groups/shared'
import { ROLES, errorMessage } from '@/components/groups/roles'
import type { UserSummary, UserType } from '@/types'
import { cn } from '@/lib/utils'

/** Solo admin: lista de usuarios y cambio de rol (user / boss / admin). */
export function UsersAdmin() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<UserSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setUsers(await UsersApi.list())
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const setRole = async (u: UserSummary, userType: UserType) => {
    if (u.userType === userType) return
    setSavingId(u.id)
    try {
      const res = await UsersApi.setType(u.id, userType)
      setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, userType: res.user.userType } : x)))
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSavingId(null)
    }
  }

  const f = filter.trim().toLowerCase()
  const shown = f ? users.filter((u) => u.name.toLowerCase().includes(f) || u.email.toLowerCase().includes(f)) : users
  const counts = Object.fromEntries(ROLES.map((r) => [r.id, users.filter((u) => u.userType === r.id).length]))

  return (
    <div className="space-y-4">
      {/* Role legend */}
      <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
        {ROLES.map((r) => (
          <div key={r.id} className="space-y-0.5 bg-card p-4">
            <p className="flex items-baseline justify-between text-sm font-semibold text-foreground">
              {r.label}
              <span className="text-xs font-normal tabular-nums text-muted-foreground">{counts[r.id] ?? 0}</span>
            </p>
            <p className="text-xs text-muted-foreground">{r.hint}</p>
          </div>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrar por nombre o correo"
          aria-label="Filtrar usuarios"
          className="flex h-9 w-full rounded-lg border border-input bg-card pl-9 pr-9 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        {filter && (
          <button
            type="button"
            onClick={() => setFilter('')}
            aria-label="Limpiar filtro"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : shown.length === 0 ? (
          <div className="space-y-3 px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">{f ? `Nadie coincide con «${filter}».` : 'No hay usuarios.'}</p>
            {!f && (
              <Button variant="outline" size="sm" onClick={load}>
                Recargar
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((u) => {
              const isMe = u.id === me?.id
              return (
                <li key={u.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <UserAvatar user={u} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {u.name || u.email}
                        {isMe && <span className="font-normal text-muted-foreground"> (tú)</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {savingId === u.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    <div
                      role="radiogroup"
                      aria-label={`Rol de ${u.name || u.email}`}
                      className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5"
                    >
                      {ROLES.map((r) => {
                        const selected = u.userType === r.id
                        // Un admin no puede quitarse el rol a sí mismo (el backend también lo impide)
                        const disabled = savingId === u.id || (isMe && r.id !== 'admin')
                        return (
                          <button
                            key={r.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            disabled={disabled}
                            onClick={() => setRole(u, r.id)}
                            title={isMe && r.id !== 'admin' ? 'No puedes quitarte el rol de admin' : r.hint}
                            className={cn(
                              'h-7 rounded-md px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed',
                              selected
                                ? 'bg-card text-foreground shadow-xs'
                                : 'text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground'
                            )}
                          >
                            {r.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Los cambios de rol se aplican la próxima vez que esa persona abra la app o inicie sesión.
      </p>
    </div>
  )
}
