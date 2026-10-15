import { useState } from 'react'
import { CircleCheck, Loader2, Send } from 'lucide-react'
import { GroupsApi } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { errorMessage } from '@/components/groups/roles'
import type { Group, NotificationType } from '@/types'
import { cn } from '@/lib/utils'

const TYPES: { id: NotificationType; label: string }[] = [
  { id: 'info', label: 'Info' },
  { id: 'success', label: 'Éxito' },
  { id: 'warning', label: 'Atención' },
  { id: 'error', label: 'Crítico' },
  { id: 'calendar', label: 'Evento' },
]

/** Envía una notificación a todos los miembros del grupo (POST /api/notifications). */
export function SendToGroupDialog({ open, group, onClose }: { open: boolean; group: Group; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {open && <SendForm group={group} onClose={onClose} />}
    </Dialog>
  )
}

function SendForm({ group, onClose }: { group: Group; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [type, setType] = useState<NotificationType>('info')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<number | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setSending(true)
    setError(null)
    try {
      const res = await GroupsApi.send({
        title: title.trim(),
        message: message.trim() || undefined,
        type,
        date: date || undefined,
        time: date && time ? time : undefined,
        source: group.name,
        groupIds: [group.id],
      })
      setSentTo(res.recipients)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSending(false)
    }
  }

  if (sentTo !== null) {
    return (
      <DialogContent onClose={onClose}>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CircleCheck className="h-10 w-10 text-success" />
          <div className="space-y-1">
            <p className="text-base font-semibold text-foreground">Notificación enviada</p>
            <p className="text-sm text-muted-foreground">
              Llegó a {sentTo} {sentTo === 1 ? 'persona' : 'personas'} de «{group.name}»
              {date && ' y quedó en su calendario'}.
            </p>
          </div>
          <Button onClick={onClose} className="mt-2">
            Listo
          </Button>
        </div>
      </DialogContent>
    )
  }

  return (
    <DialogContent onClose={onClose}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Send className="h-5 w-5 text-primary" />
          Enviar a «{group.name}»
        </DialogTitle>
        <DialogDescription>
          {group.memberCount === 1
            ? 'La recibirá al instante el único miembro del grupo.'
            : `La recibirán al instante los ${group.memberCount} miembros del grupo.`}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={submit} className="space-y-4 pt-2">
        <div className="space-y-1.5">
          <label htmlFor="send-title" className="text-xs font-semibold text-foreground">
            Título *
          </label>
          <Input
            id="send-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej. Mantenimiento esta noche"
            required
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="send-msg" className="text-xs font-semibold text-foreground">
            Mensaje
          </label>
          <textarea
            id="send-msg"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Detalles para el equipo"
            rows={3}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-foreground">Tipo</span>
          <div className="grid grid-cols-5 gap-1.5">
            {TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setType(t.id)}
                className={cn(
                  'rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors',
                  type === t.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="send-date" className="text-xs font-semibold text-foreground">
              Fecha <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <Input id="send-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="send-time" className="text-xs font-semibold text-foreground">
              Hora
            </label>
            <Input id="send-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!date} />
          </div>
        </div>
        {date && (
          <p className="text-xs text-muted-foreground">
            Con fecha, también se añade al calendario de cada miembro{time && ' y les avisará a esa hora'}.
          </p>
        )}

        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={sending || !title.trim()} className="gap-1.5">
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Enviar
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
