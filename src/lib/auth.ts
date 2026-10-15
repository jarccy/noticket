// Validaciones de autenticación del lado del cliente (las mismas reglas que aplica notiback).

export const PASSWORD_MIN_LENGTH = 8

export interface AuthUser {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  hasPassword: boolean
  hasGoogle: boolean
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+$/

export const isValidEmail = (email: string) => email.length <= 254 && EMAIL_RE.test(email.trim())

/** Mensaje de error si la contraseña no cumple los requisitos; null si es válida. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`
  if (new TextEncoder().encode(password).length > 72) return 'La contraseña no puede superar 72 caracteres'
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) return 'La contraseña debe incluir letras y números'
  return null
}

/** Mensajes para los códigos ?auth_error= con los que vuelve el login de Google. */
export const AUTH_ERRORS: Record<string, string> = {
  google: 'No se pudo iniciar sesión con Google. Inténtalo de nuevo.',
  google_cancelled: 'Cancelaste el inicio de sesión con Google.',
  google_state: 'La sesión de Google caducó. Vuelve a intentarlo.',
  google_unverified: 'Tu correo de Google no está verificado.',
  google_not_configured: 'El login con Google no está configurado en el servidor (GOOGLE_CLIENT_ID).',
}
