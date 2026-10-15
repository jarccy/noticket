import { Crown, Shield } from 'lucide-react'
import { roleLabel } from '@/components/groups/roles'
import type { UserSummary, UserType } from '@/types'
import { cn } from '@/lib/utils'

export function RoleBadge({ type, className }: { type: UserType; className?: string }) {
  if (type === 'user') return null
  const Icon = type === 'admin' ? Shield : Crown
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        type === 'admin' ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-muted text-foreground',
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {roleLabel(type)}
    </span>
  )
}

export function UserAvatar({ user, className }: { user: Pick<UserSummary, 'name' | 'email' | 'avatarUrl'>; className?: string }) {
  const initials = (user.name || user.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt=""
        referrerPolicy="no-referrer"
        className={cn('h-8 w-8 shrink-0 rounded-full object-cover', className)}
      />
    )
  }
  return (
    <span
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold uppercase text-foreground',
        className
      )}
    >
      {initials}
    </span>
  )
}
