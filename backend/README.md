# notiback

Backend en Go ([Gin](https://gin-gonic.com)) + PostgreSQL para la app **noticket**. Persiste webhooks, eventos de calendario y ajustes, y emite los webhooks en tiempo real por SSE (mismo formato que `vite-webhook-plugin.ts`).

## Arranque

```powershell
copy .env.example .env      # edita DATABASE_URL con tu usuario/contraseña
go run ./cmd/server
```

Al iniciar aplica las migraciones de `internal/db/migrations/` en la base `dbnoticket` (se registran en `schema_migrations`). Si prefieres crearlas a mano: `psql -U postgres -d dbnoticket -f schema.sql`.

## Tablas

| Tabla | Contenido |
|---|---|
| `webhook_events` | Webhooks recibidos (`WebhookEvent`), payload original en `raw_payload` (JSONB) |
| `calendar_events` | Eventos de calendario (`CalendarEvent`), `webhook_id` → `webhook_events.id` |
| `app_settings` | Fila única (`id = 1`) con `AppSettings` |
| `users` | Usuarios (correo/contraseña con bcrypt y/o Google) |
| `sessions` | Sesiones (SHA-256 del token, caducan a las 24 h o 30 días con "Recordarme") |
| `password_reset_tokens` | Enlaces de restablecimiento (un solo uso, 1 hora) |
| `oauth_states`, `login_codes` | Estado temporal del login con Google |

## Endpoints

🔒 = requiere `Authorization: Bearer <token>`. Todas las rutas `/api/webhooks`, `/api/calendar` y `/api/settings` lo requieren; `POST /webhook` sigue siendo público (protegido por el secreto de webhook).

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Estado del servidor |
| GET | `/api/auth/providers` | `{google: bool}` |
| POST | `/api/auth/register` | `{name, email, password, remember}` → `{token, expiresAt, user}` |
| POST | `/api/auth/login` | `{email, password, remember}` → `{token, expiresAt, user}` |
| POST | `/api/auth/forgot-password` | `{email, redirectTo}` → envía el enlace (sin SMTP lo imprime en el log) |
| POST | `/api/auth/reset-password/validate` | `{token}` → `{valid}` |
| POST | `/api/auth/reset-password` | `{token, password}` → cambia la clave y cierra todas las sesiones |
| GET | `/api/auth/google?redirect_to=` | Inicia el login con Google (PKCE) |
| GET | `/api/auth/google/callback` | Vuelta de Google → redirige al frontend con `?google_code=` |
| POST | `/api/auth/google/exchange` | `{code, remember}` → `{token, expiresAt, user}` |
| GET | `/api/auth/me` 🔒 | Usuario actual |
| POST | `/api/auth/logout` 🔒 | Cierra la sesión |
| POST | `/webhook`, `/api/webhook` | Recibe un webhook (valida `x-webhook-secret` o `Authorization: Bearer` si hay secreto configurado) |
| GET | `/api/events?access_token=` 🔒 | Stream SSE: primero `{type:"connected", history}`, luego cada `WebhookEvent` |
| GET | `/api/webhooks?limit=&unread=true` | Historial |
| POST | `/api/webhooks` | Guarda un `WebhookEvent` ya procesado por la app (Tauri/Vite). Idempotente por `id` |
| GET | `/api/webhooks/{id}` | Un webhook |
| PATCH | `/api/webhooks/{id}/read` | Marcar como leído |
| POST | `/api/webhooks/read-all` | Marcar todos como leídos |
| DELETE | `/api/webhooks/{id}` · `/api/webhooks` | Borrar uno · todos |
| GET | `/api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD` | Eventos de calendario |
| POST | `/api/calendar` | Crear evento |
| PUT | `/api/calendar/{id}` | Actualizar evento |
| DELETE | `/api/calendar/{id}` | Borrar evento |
| GET | `/api/settings` | Ajustes |
| PUT/PATCH | `/api/settings` | Actualizar ajustes (parcial) |

Ejemplo:

```powershell
curl -X POST http://localhost:8080/webhook -H "Content-Type: application/json" -d '{\"title\":\"Deploy OK\",\"status\":\"success\",\"source\":\"GitHub\"}'
```

## Conexión con noticket

`noticket/src/services/api.ts` llama a este backend (`VITE_API_URL`, por defecto `http://localhost:8080`). `AppContext.tsx` carga webhooks, calendario y ajustes desde Postgres al iniciar y guarda cada cambio: webhooks entrantes, marcar como leído, borrar, crear o eliminar eventos de calendario y ajustes. Si el backend no responde, la app sigue funcionando con localStorage.

## Autenticación

- Correo y contraseña (bcrypt, mínimo 8 caracteres con letras y números) y Google OAuth (Authorization Code + PKCE).
- El token de sesión es aleatorio (256 bits); en la base solo se guarda su SHA-256. Se envía como `Authorization: Bearer`.
- Límite de intentos en memoria para login, registro y restablecimiento.
- **Google**: crea un ID de cliente OAuth tipo "Aplicación web" en Google Cloud Console, añade como URI de redireccionamiento `http://localhost:8080/api/auth/google/callback` y pon `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` en `.env`.
- **Correo**: configura `SMTP_*` en `.env`. Sin `SMTP_HOST`, el enlace para restablecer la contraseña se imprime en el log del servidor.
