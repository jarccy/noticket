import { useCallback, useMemo, useState } from 'react'
import { Check, Minus, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Selección múltiple sobre una lista de ids. Los ids que ya no existen (borrados,
 * filtrados) se ignoran automáticamente.
 */
export function useSelection(visibleIds: string[]) {
  const [active, setActive] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(() => new Set())

  const visible = useMemo(() => new Set(visibleIds), [visibleIds])
  const selected = useMemo(() => [...picked].filter((id) => visible.has(id)), [picked, visible])
  const allSelected = visibleIds.length > 0 && selected.length === visibleIds.length

  const toggle = useCallback((id: string) => {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setPicked(allSelected ? new Set() : new Set(visibleIds))
  }, [allSelected, visibleIds])

  const start = useCallback((id?: string) => {
    setActive(true)
    setPicked(id ? new Set([id]) : new Set())
  }, [])

  const stop = useCallback(() => {
    setActive(false)
    setPicked(new Set())
  }, [])

  return {
    active,
    selected,
    count: selected.length,
    allSelected,
    isSelected: (id: string) => picked.has(id),
    toggle,
    toggleAll,
    start,
    stop,
  }
}

export type Selection = ReturnType<typeof useSelection>

export function Checkbox({
  checked,
  indeterminate,
  onChange,
  label,
  className,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: () => void
  label: string
  className?: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onChange()
      }}
      className={cn(
        'flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center rounded-[5px] border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-90',
        checked || indeterminate
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-muted-foreground/40 bg-card hover:border-primary/60',
        className
      )}
    >
      {indeterminate ? <Minus className="h-3 w-3" strokeWidth={3} /> : checked && <Check className="h-3 w-3" strokeWidth={3} />}
    </button>
  )
}

/**
 * Barra del modo selección: seleccionar todo, contador, cancelar y eliminar.
 */
export function SelectionBar({
  selection,
  total,
  noun,
  onDelete,
  compact,
  className,
}: {
  selection: Selection
  total: number
  /** Ej. ['evento', 'eventos'] */
  noun: [string, string]
  onDelete: () => void
  /** Para paneles estrechos: sin textos secundarios. */
  compact?: boolean
  className?: string
}) {
  const { count, allSelected, toggleAll, stop } = selection
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 animate-in fade-in',
        className
      )}
    >
      <Checkbox
        checked={allSelected}
        indeterminate={count > 0 && !allSelected}
        onChange={toggleAll}
        label={allSelected ? 'Quitar selección' : 'Seleccionar todos'}
      />
      <button
        type="button"
        onClick={toggleAll}
        className={cn('hidden text-xs font-medium text-muted-foreground hover:text-foreground', !compact && 'sm:block')}
      >
        {allSelected ? 'Quitar selección' : `Seleccionar todos (${total})`}
      </button>
      <span className={cn('flex-1 truncate text-xs font-semibold text-foreground', !compact && 'sm:text-center')}>
        {count === 0 ? (compact ? 'Ninguno' : 'Elige qué eliminar') : `${count} ${count === 1 ? noun[0] : noun[1]}`}
      </span>
      <button
        type="button"
        onClick={stop}
        className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
        {compact && <span className="sr-only">Cancelar</span>}
        <span className={cn('hidden', !compact && 'sm:inline')}>Cancelar</span>
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={count === 0}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-destructive px-3 text-xs font-medium text-destructive-foreground shadow-xs transition-all hover:bg-destructive/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Eliminar{count > 0 && ` (${count})`}
      </button>
    </div>
  )
}
