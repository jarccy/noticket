import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import { isTauri } from '@/lib/platform'

/**
 * «Iniciar con Windows»: la app se registra para arrancar al iniciar sesión y, cuando lo
 * hace así, se queda en la bandeja (recibiendo avisos) sin abrir la ventana. El estado real
 * vive en el sistema (registro de Windows); aquí solo se consulta y se cambia.
 */

const DEFAULT_APPLIED_KEY = 'noticket_autostart_default_applied'

export async function getAutostart(): Promise<boolean> {
  if (!isTauri()) return false
  try {
    return await isEnabled()
  } catch {
    return false
  }
}

export async function setAutostart(on: boolean): Promise<void> {
  if (on) await enable()
  else await disable()
}

/**
 * Primer arranque de la app instalada: activa el inicio con Windows una sola vez. Si después
 * el usuario lo apaga en Ajustes, se respeta. En desarrollo no se toca, para no registrar en
 * Windows el ejecutable de pruebas.
 */
export async function applyAutostartDefault(): Promise<void> {
  if (!isTauri() || !import.meta.env.PROD) return
  try {
    if (localStorage.getItem(DEFAULT_APPLIED_KEY)) return
    if (!(await isEnabled())) await enable()
    localStorage.setItem(DEFAULT_APPLIED_KEY, '1')
  } catch (err) {
    console.warn('[autostart] no se pudo activar el inicio con Windows', err)
  }
}
