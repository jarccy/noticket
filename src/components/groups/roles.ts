import { ApiError } from '@/services/api'
import type { UserType } from '@/types'

export const ROLES: { id: UserType; label: string; hint: string }[] = [
  { id: 'user', label: 'Usuario', hint: 'Solo ve y crea sus propias notificaciones' },
  { id: 'boss', label: 'Boss', hint: 'Crea grupos y envía notificaciones a sus grupos' },
  { id: 'admin', label: 'Admin', hint: 'Ve todo y gestiona los roles' },
]

export const roleLabel = (t: UserType) => ROLES.find((r) => r.id === t)?.label ?? t

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  return 'Algo salió mal. Inténtalo de nuevo.'
}
