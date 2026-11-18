import type { ReactNode } from 'react'

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <span className="block h-1 w-8 rounded-full bg-brand glow-primary" aria-hidden />
        <h1 className="text-[28px] font-bold leading-tight text-foreground">{title}</h1>
        {description && <p className="max-w-[65ch] text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
