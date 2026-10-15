import { useState } from 'react'
import { Loader2, UsersRound } from 'lucide-react'
import { GroupsApi } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { errorMessage } from '@/components/groups/roles'
import type { Group } from '@/types'

/** Crear un grupo (sin `group`) o editar su nombre y descripción. */
export function GroupFormDialog({
  open,
  group,
  onClose,
  onSaved,
}: {
  open: boolean
  group?: Group
  onClose: () => void
  onSaved: (group: Group) => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {/* key: el formulario se reinicia cada vez que se abre */}
      {open && <GroupForm key={group?.id ?? 'new'} group={group} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  )
}

function GroupForm({ group, onClose, onSaved }: { group?: Group; onClose: () => void; onSaved: (group: Group) => void }) {
  const [name, setName] = useState(group?.name ?? '')
  const [description, setDescription] = useState(group?.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      const saved = group
        ? await GroupsApi.update(group.id, { name: name.trim(), description: description.trim() })
        : await GroupsApi.create(name.trim(), description.trim())
      onSaved(saved)
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setSaving(false)
    }
  }

  return (
    <DialogContent onClose={onClose}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <UsersRound className="h-5 w-5 text-primary" />
          {group ? 'Editar grupo' : 'Nuevo grupo'}
        </DialogTitle>
        <DialogDescription>
          {group ? 'Cambia el nombre o la descripción del grupo.' : 'Después podrás añadir usuarios y enviarles notificaciones a todos a la vez.'}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={submit} className="space-y-4 pt-2">
        <div className="space-y-1.5">
          <label htmlFor="group-name" className="text-xs font-semibold text-foreground">
            Nombre *
          </label>
          <Input
            id="group-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Equipo de soporte"
            maxLength={80}
            required
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="group-desc" className="text-xs font-semibold text-foreground">
            Descripción
          </label>
          <textarea
            id="group-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Para qué sirve este grupo (opcional)"
            rows={3}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving || !name.trim()} className="gap-1.5">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {group ? 'Guardar cambios' : 'Crear grupo'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
