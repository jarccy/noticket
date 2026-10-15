import { useCallback, useEffect, useState } from 'react'
import { Crown, Loader2, Pencil, Plus, Send, Trash2, Users, UsersRound } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { GroupsApi } from '@/services/api'
import { PageHeader } from '@/components/ui/page-header'
import { Segmented } from '@/components/ui/segmented'
import { Button } from '@/components/ui/button'
import { GroupFormDialog } from '@/components/groups/GroupFormDialog'
import { SendToGroupDialog } from '@/components/groups/SendToGroupDialog'
import { MemberPicker } from '@/components/groups/MemberPicker'
import { UsersAdmin } from '@/components/groups/UsersAdmin'
import { RoleBadge, UserAvatar } from '@/components/groups/shared'
import { errorMessage } from '@/components/groups/roles'
import type { Group } from '@/types'
import { cn } from '@/lib/utils'

type Section = 'groups' | 'users'

export function GroupsView() {
  const { user } = useAuth()
  const isAdmin = user?.userType === 'admin'
  const [section, setSection] = useState<Section>('groups')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Grupos"
        description={
          isAdmin
            ? 'Crea grupos, asigna usuarios y envía notificaciones a varios a la vez. Como admin también gestionas los roles.'
            : 'Crea grupos, asigna usuarios y envía notificaciones a todos sus miembros a la vez.'
        }
        actions={
          isAdmin && (
            <Segmented
              ariaLabel="Sección"
              value={section}
              onChange={setSection}
              options={[
                { id: 'groups', label: 'Grupos' },
                { id: 'users', label: 'Usuarios y roles' },
              ]}
            />
          )
        }
      />
      {section === 'users' && isAdmin ? <UsersAdmin /> : <GroupsPanel />}
    </div>
  )
}

function GroupsPanel() {
  const { user } = useAuth()
  const isAdmin = user?.userType === 'admin'
  const [showAll, setShowAll] = useState(false)
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const loadGroups = useCallback(async () => {
    try {
      const list = await GroupsApi.list(isAdmin && showAll)
      setGroups(list)
      setError(null)
      setSelectedId((cur) => (cur && list.some((g) => g.id === cur) ? cur : (list[0]?.id ?? null)))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [isAdmin, showAll])

  useEffect(() => {
    loadGroups()
  }, [loadGroups])

  const selected = groups.find((g) => g.id === selectedId) ?? null

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* Group list */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          {isAdmin ? (
            <Segmented
              ariaLabel="Qué grupos ver"
              value={showAll ? 'all' : 'mine'}
              onChange={(v) => setShowAll(v === 'all')}
              options={[
                { id: 'mine', label: 'Míos' },
                { id: 'all', label: 'Todos' },
              ]}
            />
          ) : (
            <h2 className="text-sm font-semibold text-foreground">Tus grupos</h2>
          )}
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Nuevo grupo
          </Button>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {loading ? (
            <div className="space-y-px">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                    <div className="h-2.5 w-1/3 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="space-y-3 px-4 py-8 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={loadGroups}>
                Reintentar
              </Button>
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <UsersRound className="h-6 w-6 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">Aún no hay grupos</p>
              <p className="text-xs text-muted-foreground">Crea uno y añade a las personas que deben recibir avisos juntas.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {groups.map((g) => {
                const active = g.id === selectedId
                return (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(g.id)}
                      aria-current={active ? 'true' : undefined}
                      className={cn(
                        'relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                        active ? 'bg-accent/60' : 'hover:bg-accent/40'
                      )}
                    >
                      {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-primary" aria-hidden />}
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold uppercase text-foreground">
                        {g.name.slice(0, 2)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{g.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {g.memberCount} {g.memberCount === 1 ? 'miembro' : 'miembros'}
                          {g.ownerId !== user?.id && ` · de ${g.ownerName || 'otro usuario'}`}
                        </span>
                      </span>
                      {g.ownerId === user?.id && (
                        <Crown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Lo creaste tú" />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Detail */}
      {selected ? (
        <GroupDetail key={selected.id} group={selected} onChanged={loadGroups} />
      ) : (
        !loading && (
          <div className="flex min-h-[280px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-6 text-center">
            <Users className="h-6 w-6 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Selecciona o crea un grupo para gestionar sus miembros.</p>
          </div>
        )
      )}

      <GroupFormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={(g) => {
          setSelectedId(g.id)
          loadGroups()
        }}
      />
    </div>
  )
}

function GroupDetail({ group, onChanged }: { group: Group; onChanged: () => void }) {
  const { user } = useAuth()
  const [detail, setDetail] = useState<Group | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const canManage = user?.userType === 'admin' || (group.ownerId === user?.id && user?.userType === 'boss')
  const members = detail?.members ?? []

  const loadDetail = useCallback(async () => {
    try {
      setDetail(await GroupsApi.get(group.id))
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [group.id])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  const removeMember = async (userId: string) => {
    setBusyId(userId)
    try {
      await GroupsApi.removeMember(group.id, userId)
      await loadDetail()
      onChanged()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const deleteGroup = async () => {
    try {
      await GroupsApi.remove(group.id)
      onChanged()
    } catch (err) {
      setError(errorMessage(err))
      setConfirmDelete(false)
    }
  }

  return (
    <section className="min-w-0 space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h2 className="truncate text-lg font-semibold tracking-tight text-foreground">{group.name}</h2>
          {group.description && <p className="text-sm text-muted-foreground">{group.description}</p>}
          <p className="text-xs text-muted-foreground">
            Creado por {group.ownerId === user?.id ? 'ti' : group.ownerName || 'otro usuario'} · {group.memberCount}{' '}
            {group.memberCount === 1 ? 'miembro' : 'miembros'}
          </p>
        </div>
        {canManage && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setSendOpen(true)} disabled={members.length === 0} className="gap-1.5">
              <Send className="h-3.5 w-3.5" />
              Enviar notificación
            </Button>
            <Button variant="outline" size="icon" onClick={() => setEditOpen(true)} title="Editar grupo" className="h-8 w-8">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {confirmDelete ? (
              <Button
                variant="outline"
                size="sm"
                onClick={deleteGroup}
                onBlur={() => setConfirmDelete(false)}
                autoFocus
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                ¿Eliminar?
              </Button>
            ) : (
              <Button
                variant="outline"
                size="icon"
                onClick={() => setConfirmDelete(true)}
                title="Eliminar grupo"
                className="h-8 w-8 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>

      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

      {/* Add members */}
      {canManage && (
        <MemberPicker
          groupId={group.id}
          memberIds={members.map((m) => m.id)}
          onAdded={(list) => {
            setDetail((d) => (d ? { ...d, members: list } : d))
            onChanged()
          }}
        />
      )}

      {/* Members */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Miembros</h3>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {!detail ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : members.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              {canManage ? 'Busca usuarios arriba para añadirlos al grupo.' : 'Este grupo aún no tiene miembros.'}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                  <UserAvatar user={m} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {m.name || m.email}
                      {m.id === user?.id && <span className="font-normal text-muted-foreground"> (tú)</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                  </div>
                  <RoleBadge type={m.userType} />
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => removeMember(m.id)}
                      disabled={busyId === m.id}
                      title="Quitar del grupo"
                      aria-label={`Quitar a ${m.name || m.email}`}
                      className="rounded-md p-1.5 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                    >
                      {busyId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <GroupFormDialog
        open={editOpen}
        group={group}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          onChanged()
          loadDetail()
        }}
      />
      <SendToGroupDialog open={sendOpen} group={group} onClose={() => setSendOpen(false)} />
    </section>
  )
}
