import { useEffect, useState } from 'react'
import { Check, Loader2, Search, UserPlus, X } from 'lucide-react'
import { GroupsApi, UsersApi } from '@/services/api'
import { RoleBadge, UserAvatar } from '@/components/groups/shared'
import { errorMessage } from '@/components/groups/roles'
import type { GroupMember, UserSummary } from '@/types'

/** Busca usuarios por nombre o correo y los añade al grupo. */
export function MemberPicker({
  groupId,
  memberIds,
  onAdded,
}: {
  groupId: string
  memberIds: string[]
  onAdded: (members: GroupMember[]) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UserSummary[]>([])
  const [searching, setSearching] = useState(false)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const q = query.trim()
  const active = q.length >= 2

  useEffect(() => {
    if (!active) return
    let cancelled = false
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const found = await UsersApi.search(q)
        if (!cancelled) {
          setResults(found)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) setError(errorMessage(err))
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [q, active])

  const add = async (u: UserSummary) => {
    setAddingId(u.id)
    try {
      const res = await GroupsApi.addMembers(groupId, { userIds: [u.id] })
      onAdded(res.members)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setAddingId(null)
    }
  }

  const shown = active ? results : []

  return (
    <div className="space-y-2">
      <label htmlFor="member-search" className="text-sm font-semibold text-foreground">
        Añadir usuarios
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id="member-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Busca por nombre o correo"
          autoComplete="off"
          className="flex h-10 w-full rounded-lg border border-input bg-card pl-9 pr-9 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        {searching ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : (
          query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {active && !searching && shown.length === 0 && (
        <p className="px-1 text-xs text-muted-foreground">
          Nadie coincide con «{q}». La persona tiene que haberse registrado en la app.
        </p>
      )}

      {shown.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {shown.map((u) => {
            const isMember = memberIds.includes(u.id)
            return (
              <li key={u.id} className="flex items-center gap-3 px-3 py-2">
                <UserAvatar user={u} className="h-7 w-7" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{u.name || u.email}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                </div>
                <RoleBadge type={u.userType} />
                {isMember ? (
                  <span className="flex items-center gap-1 px-2 text-xs text-muted-foreground">
                    <Check className="h-3.5 w-3.5" />
                    En el grupo
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => add(u)}
                    disabled={addingId === u.id}
                    className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                  >
                    {addingId === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                    Añadir
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
