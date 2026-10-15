import { useEffect, useState } from 'react'
import { ArrowLeft, Eye, EyeOff, Loader2, MailCheck, Radio, CheckCircle2, AlertCircle } from 'lucide-react'
import { useAuth, rememberForGoogle } from '@/context/AuthContext'
import { AuthApi } from '@/services/api'
import { isValidEmail, passwordProblem } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type View = 'login' | 'register' | 'forgot' | 'reset'

const RESET_PATH = '/reset-password'

const isResetPasswordUrl = () => window.location.pathname === RESET_PATH

function initialView(): View {
  return isResetPasswordUrl() ? 'reset' : 'login'
}

function resetTokenFromUrl(): string {
  return new URLSearchParams(window.location.search).get('token') ?? ''
}

/** Sale de /reset-password?token=… sin recargar, para que el token no quede en la URL. */
function leaveResetUrl() {
  if (window.location.pathname === RESET_PATH) window.history.replaceState(null, '', '/')
}

// ---------- Piezas ----------

function Field({
  label,
  htmlFor,
  children,
  aside,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
  aside?: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={htmlFor} className="text-xs font-medium text-foreground">
          {label}
        </label>
        {aside}
      </div>
      {children}
    </div>
  )
}

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  autoFocus,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  autoComplete: string
  autoFocus?: boolean
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        required
        className="h-10 pr-10"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

function Notice({ tone, children }: { tone: 'error' | 'success'; children: React.ReactNode }) {
  const Icon = tone === 'error' ? AlertCircle : CheckCircle2
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs leading-relaxed',
        tone === 'error'
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'border-success/30 bg-success/10 text-success'
      )}
    >
      <Icon className="mt-px h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  )
}

function SubmitButton({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" disabled={loading} className="h-10 w-full">
      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </Button>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.92l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.29 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.28a12 12 0 0 0 0 10.76l4.01-3.1Z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.5 11.5 0 0 0 12 0 12 12 0 0 0 1.28 6.62l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77Z" />
    </svg>
  )
}

function GoogleButton({ remember }: { remember: boolean }) {
  const [redirecting, setRedirecting] = useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      className="h-10 w-full gap-2"
      disabled={redirecting}
      onClick={() => {
        setRedirecting(true)
        rememberForGoogle(remember)
        window.location.href = AuthApi.googleStartUrl()
      }}
    >
      {redirecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
      Continuar con Google
    </Button>
  )
}

function Divider() {
  return (
    <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
      <span className="h-px flex-1 bg-border" />o<span className="h-px flex-1 bg-border" />
    </div>
  )
}

function RememberMe({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-input accent-primary"
      />
      Mantener la sesión iniciada
    </label>
  )
}

const linkClass = 'font-medium text-foreground underline-offset-4 hover:underline'

// ---------- Vistas ----------

function LoginView({ go, notice }: { go: (v: View) => void; notice: string | null }) {
  const { login, initialError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(initialError)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!isValidEmail(email)) return setError('Introduce un correo válido')
    setLoading(true)
    try {
      await login(email.trim(), password, remember)
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  return (
    <>
      <Header title="Inicia sesión" description="Accede a tus webhooks, calendario y notificaciones." />
      <div className="space-y-4">
        {notice && <Notice tone="success">{notice}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        <GoogleButton remember={remember} />
        <Divider />
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Correo" htmlFor="login-email">
            <Input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
              required
              className="h-10"
              placeholder="tu@correo.com"
            />
          </Field>
          <Field
            label="Contraseña"
            htmlFor="login-password"
            aside={
              <button type="button" onClick={() => go('forgot')} className="text-xs text-muted-foreground hover:text-foreground">
                ¿Olvidaste tu contraseña?
              </button>
            }
          >
            <PasswordInput id="login-password" value={password} onChange={setPassword} autoComplete="current-password" />
          </Field>
          <RememberMe checked={remember} onChange={setRemember} />
          <SubmitButton loading={loading}>Iniciar sesión</SubmitButton>
        </form>
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        ¿No tienes cuenta?{' '}
        <button type="button" onClick={() => go('register')} className={linkClass}>
          Regístrate
        </button>
      </p>
    </>
  )
}

function RegisterView({ go }: { go: (v: View) => void }) {
  const { register } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [remember, setRemember] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!isValidEmail(email)) return setError('Introduce un correo válido')
    const problem = passwordProblem(password)
    if (problem) return setError(problem)
    if (password !== confirm) return setError('Las contraseñas no coinciden')
    setLoading(true)
    try {
      await register(name.trim(), email.trim(), password, remember)
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  return (
    <>
      <Header title="Crea tu cuenta" description="Regístrate con tu correo o con tu cuenta de Google." />
      <div className="space-y-4">
        {error && <Notice tone="error">{error}</Notice>}
        <GoogleButton remember={remember} />
        <Divider />
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Nombre" htmlFor="reg-name">
            <Input
              id="reg-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              autoFocus
              className="h-10"
              placeholder="Tu nombre"
            />
          </Field>
          <Field label="Correo" htmlFor="reg-email">
            <Input
              id="reg-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              className="h-10"
              placeholder="tu@correo.com"
            />
          </Field>
          <Field label="Contraseña" htmlFor="reg-password">
            <PasswordInput id="reg-password" value={password} onChange={setPassword} autoComplete="new-password" />
          </Field>
          <Field label="Repite la contraseña" htmlFor="reg-confirm">
            <PasswordInput id="reg-confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          </Field>
          <p className="text-[11px] text-muted-foreground">Mínimo 8 caracteres, con letras y números.</p>
          <RememberMe checked={remember} onChange={setRemember} />
          <SubmitButton loading={loading}>Crear cuenta</SubmitButton>
        </form>
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        ¿Ya tienes cuenta?{' '}
        <button type="button" onClick={() => go('login')} className={linkClass}>
          Inicia sesión
        </button>
      </p>
    </>
  )
}

function ForgotView({ go }: { go: (v: View) => void }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!isValidEmail(email)) return setError('Introduce un correo válido')
    setLoading(true)
    try {
      const { message } = await AuthApi.forgotPassword(email.trim())
      setSent(message)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <BackButton onClick={() => go('login')} />
      <Header
        title="Restablece tu contraseña"
        description="Te enviaremos un enlace para elegir una nueva. Caduca en 1 hora."
      />
      {sent ? (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-6 text-center">
            <MailCheck className="h-8 w-8 text-success" />
            <p className="text-sm text-foreground">{sent}</p>
            <p className="text-xs text-muted-foreground">Revisa también la carpeta de spam.</p>
          </div>
          <Button type="button" variant="outline" className="h-10 w-full" onClick={() => go('login')}>
            Volver a iniciar sesión
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <Notice tone="error">{error}</Notice>}
          <Field label="Correo" htmlFor="forgot-email">
            <Input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
              required
              className="h-10"
              placeholder="tu@correo.com"
            />
          </Field>
          <SubmitButton loading={loading}>Enviar enlace</SubmitButton>
        </form>
      )}
    </>
  )
}

function ResetView({ go, onDone }: { go: (v: View) => void; onDone: (message: string) => void }) {
  const [token] = useState(resetTokenFromUrl)
  const [valid, setValid] = useState<boolean | null>(token ? null : false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    AuthApi.validateResetToken(token)
      .then(({ valid }) => setValid(valid))
      .catch((err) => {
        setError((err as Error).message)
        setValid(true) // deja intentar; el POST volverá a validar
      })
  }, [token])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const problem = passwordProblem(password)
    if (problem) return setError(problem)
    if (password !== confirm) return setError('Las contraseñas no coinciden')
    setLoading(true)
    try {
      const { message } = await AuthApi.resetPassword(token, password)
      onDone(message)
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  const goForgot = () => {
    leaveResetUrl()
    go('forgot')
  }

  return (
    <>
      <Header title="Nueva contraseña" description="Elige una contraseña nueva para tu cuenta." />
      {valid === null ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : valid === false ? (
        <div className="space-y-4">
          <Notice tone="error">El enlace no es válido o ha caducado. Solicita uno nuevo.</Notice>
          <Button type="button" className="h-10 w-full" onClick={goForgot}>
            Solicitar otro enlace
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <Notice tone="error">{error}</Notice>}
          <Field label="Nueva contraseña" htmlFor="reset-password">
            <PasswordInput id="reset-password" value={password} onChange={setPassword} autoComplete="new-password" autoFocus />
          </Field>
          <Field label="Repite la contraseña" htmlFor="reset-confirm">
            <PasswordInput id="reset-confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          </Field>
          <p className="text-[11px] text-muted-foreground">
            Mínimo 8 caracteres, con letras y números. Se cerrarán las sesiones abiertas en otros dispositivos.
          </p>
          <SubmitButton loading={loading}>Guardar contraseña</SubmitButton>
        </form>
      )}
    </>
  )
}

function Header({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6 space-y-1.5">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-4 -ml-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Volver
    </button>
  )
}

// ---------- Pantalla ----------

export function AuthScreen() {
  const { status, logout, closeAuth } = useAuth()
  const [view, setView] = useState<View>(initialView)
  const [notice, setNotice] = useState<string | null>(null)

  // Abrir un enlace de restablecimiento con la sesión iniciada la cierra (al cambiar la clave
  // se invalidan todas las sesiones de todos modos)
  useEffect(() => {
    if (status === 'authenticated' && view === 'reset') logout()
  }, [status, view, logout])

  const continueWithoutAccount = () => {
    leaveResetUrl()
    closeAuth()
  }

  const go = (v: View) => {
    setNotice(null)
    setView(v)
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10 text-foreground antialiased">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Radio className="h-[18px] w-[18px]" />
          </div>
          <span className="text-sm font-semibold tracking-tight">PulseDesk</span>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          {view === 'login' && <LoginView key="login" go={go} notice={notice} />}
          {view === 'register' && <RegisterView key="register" go={go} />}
          {view === 'forgot' && <ForgotView key="forgot" go={go} />}
          {view === 'reset' && (
            <ResetView
              key="reset"
              go={go}
              onDone={(message) => {
                leaveResetUrl()
                setView('login')
                setNotice(message)
              }}
            />
          )}
        </div>

        <div className="mt-5 space-y-1 text-center">
          <button
            type="button"
            onClick={continueWithoutAccount}
            className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Continuar sin cuenta
          </button>
          <p className="text-[11px] text-muted-foreground/80">
            Tus datos se guardarán en este equipo y podrás sincronizarlos al iniciar sesión.
          </p>
        </div>
      </div>
    </div>
  )
}
