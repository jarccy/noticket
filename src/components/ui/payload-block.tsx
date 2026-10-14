import { useState, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

export function useCopy(timeout = 1800) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const copy = (key: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), timeout)
  }
  return { copiedKey, copy }
}

export function CopyButton({ copied, onClick, label = 'Copiar' }: { copied: boolean; onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copiado' : label}
    </button>
  )
}

/** Code / JSON block with a header row for a label and actions. */
export function CodeBlock({
  label,
  actions,
  children,
  className,
  maxHeight = 'max-h-64',
}: {
  label?: ReactNode
  actions?: ReactNode
  children: string
  className?: string
  maxHeight?: string
}) {
  return (
    <div className={cn('overflow-hidden rounded-lg border border-border bg-code', className)}>
      {(label || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1">
          <span className="font-mono text-[11px] text-muted-foreground">{label}</span>
          <div className="flex items-center gap-0.5">{actions}</div>
        </div>
      )}
      <pre className={cn('overflow-auto p-3 font-mono text-xs leading-relaxed text-code-foreground', maxHeight)}>
        {children}
      </pre>
    </div>
  )
}
