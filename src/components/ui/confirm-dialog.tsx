import { useEffect, useRef } from 'react'
import { Trash2, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'

const MAX_PREVIEW = 5

export interface ConfirmDialogProps {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
  title: string
  description?: React.ReactNode
  /** Elementos afectados: se muestran los primeros y «y N más». */
  items?: string[]
  confirmLabel?: string
  icon?: LucideIcon
}

/**
 * Confirmación de una acción destructiva. El foco empieza en «Cancelar» para que un Enter
 * accidental no borre nada.
 */
export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  items = [],
  confirmLabel = 'Eliminar',
  icon: Icon = Trash2,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) cancelRef.current?.focus()
  }, [open])

  const shown = items.slice(0, MAX_PREVIEW)
  const rest = items.length - shown.length

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:gap-4 sm:text-left">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive ring-8 ring-destructive/5">
            <Icon className="h-5 w-5" />
          </span>
          <div className="mt-3 min-w-0 flex-1 sm:mt-0">
            <h2 id="confirm-title" className="text-base font-semibold text-foreground">
              {title}
            </h2>
            {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}

            {shown.length > 0 && (
              <ul className="mt-3 space-y-1 rounded-lg border border-border bg-muted/40 p-2 text-left">
                {shown.map((item, i) => (
                  <li key={i} className="flex items-center gap-2 truncate text-xs text-foreground">
                    <span className="h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                    <span className="truncate">{item}</span>
                  </li>
                ))}
                {rest > 0 && <li className="pl-3 text-xs text-muted-foreground">y {rest} más</li>}
              </ul>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={onConfirm} className="gap-1.5">
            <Icon className="h-4 w-4" />
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
