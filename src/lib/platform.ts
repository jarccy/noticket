import { isTauri as tauriCheck } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

export const isTauri = (): boolean => {
  try {
    return tauriCheck()
  } catch {
    return false
  }
}

/** 'main' in the browser; the Tauri window label otherwise ('main' | 'notify'). */
export function currentWindowLabel(): string {
  if (!isTauri()) return 'main'
  try {
    return getCurrentWindow().label
  } catch {
    return 'main'
  }
}

/** Canonical endpoint: the dedicated port works in both `pnpm dev` and the installed app. */
export const WEBHOOK_ENDPOINT = 'http://localhost:3690/webhook'
