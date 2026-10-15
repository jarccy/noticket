import { cn } from '@/lib/utils'

export interface SegmentedOption<T extends string> {
  id: T
  label: string
  count?: number
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  ariaLabel,
}: {
  value: T
  onChange: (value: T) => void
  options: SegmentedOption<T>[]
  className?: string
  ariaLabel?: string
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      // Scrolls sideways instead of overflowing on narrow phones
      className={cn(
        'inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-muted p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className
      )}
    >
      {options.map((o) => {
        const active = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={cn(
              'flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-medium transition-colors',
              active ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={cn('tabular-nums', active ? 'text-muted-foreground' : 'text-muted-foreground/70')}>
                {o.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
