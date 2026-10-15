# notiback

Backend en Go ([Gin](https://gin-gonic.com)) + PostgreSQL para la app **noticket**. Persiste webhooks, eventos de calendario, ajustes, usuarios y grupos, y emite las notificaciones en tiempo real por SSE a cada destinatario.

## Arranque

```powershell
copy .env.example .env      # edita DATABASE_URL con tu usuario/contraseña y ADMIN_EMAILS
go run ./cmd/server
```

Al iniciar aplica las migraciones de `internal/db/migrations/` en la base `dbnoticket` (se registran en `schema_migrations`). Si prefieres crearlas a mano: `psql -U postgres -d dbnoticket -f schema.sql`.

## Roles

Cada usuario tiene un `user_type`:

| Rol | Puede |
|---|---|
| `user` (por defecto) | Ver y crear sus propias notificaciones, recibir las que le envían, gestionar su calendario y ajustes |
| `boss` | Lo anterior + crear grupos, añadir/quitar miembros y enviar notificaciones (o repartir webhooks) a **sus** grupos |
| `admin` | Todo: ver los webhooks, calendarios y grupos de todos (`?scope=all`), enviar a cualquier grupo o usuario y cambiar roles |

- **Primer admin**: pon su correo en `ADMIN_EMAILS` (separados por coma). Se aplica al arrancar el servidor y al registrarse.
- Los demás roles los asigna un admin con `PATCH /api/users/{id}` `{"userType": "boss"}`.
- **Sin sesión no se recibe ningún webhook**: `POST /webhook` exige el secreto de webhook de un usuario registrado, y la app de escritorio rechaza los webhooks externos (puerto 3690) hasta que se inicia sesión. Sin sesión solo se pueden crear notificaciones propias (se quedan en el equipo).

## Borrado lógico

Nada se borra con `DELETE` en SQL: las filas pasan a `status = 'deleted'` con `deleted_at`, y las consultas solo devuelven `status = 'active'`.

- **Webhooks**: borrar uno lo quita del historial de *ese* usuario (`notification_recipients.status`). Con `?scope=all`, quien lo creó o un admin lo retira para todos (`webhook_events.status`).
- **Calendario** y **grupos**: `status = 'deleted'`. Un evento de calendario borrado no se resucita con un `PUT`.

## Tablas

| Tabla | Contenido |
|---|---|
| `users` | Usuarios (correo/contraseña con bcrypt y/o Google) y su `user_type` |
| `user_groups` | Grupos (`owner_id` = el boss que lo creó), con borrado lógico |
| `group_members` | Miembros de cada grupo |
| `webhook_events` | Cada notificación una sola vez: payload original en `raw_payload` (JSONB), `created_by`, `group_id`, `status` |
| `notification_recipients` | A quién se entregó cada notificación y su estado por usuario (`read`, `status`) |
| `calendar_events` | Calendario de cada usuario (`user_id`; el `id` es único por usuario), `webhook_id` → `webhook_events.id`, `status` |
| `user_settings` | Ajustes por usuario, incluido su `webhook_secret` (único) |
| `sessions` | Sesiones (SHA-256 del token, caducan a las 24 h o 30 días con "Recordarme") |
| `password_reset_tokens` | Enlaces de restablecimiento (un solo uso, 1 hora) |
| `oauth_states`, `login_codes` | Estado temporal del login con Google |
| `app_settings` | Obsoleta desde la migración 003 (sustituida por `user_settings`) |

Los webhooks y eventos de calendario anteriores a la migración 003 no tienen dueño: solo los ve un admin con `?scope=all`.

## Endpoints

🔒 = requiere `Authorization: Bearer <token de sesión>`. 👑 = solo boss o admin. 🛡️ = solo admin.

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
| GET | `/api/auth/me` 🔒 | Usuario actual (incluye `userType`) |
| POST | `/api/auth/logout` 🔒 | Cierra la sesión |
| POST | `/webhook`, `/api/webhook` | Recibe un webhook. `x-webhook-secret` (o `Authorization: Bearer`) = secreto del usuario que lo recibe. Un boss/admin puede incluir `"groupId"`/`"groupIds"` en el payload para repartirlo a sus grupos, y un admin `"userIds"` |
| GET | `/api/events?access_token=` 🔒 | Stream SSE del usuario: primero `{type:"connected", history}`, luego cada `WebhookEvent` que recibe |
| GET | `/api/webhooks?limit=&unread=true&scope=all` 🔒 | Historial del usuario (`scope=all` 🛡️: todos) |
| POST | `/api/webhooks` 🔒 | Guarda un `WebhookEvent` ya procesado por la app (Tauri/Vite) en el historial del usuario. Idempotente por `id` |
| GET | `/api/webhooks/{id}` 🔒 | Un webhook (si eres destinatario, o admin) |
| PATCH | `/api/webhooks/{id}/read` 🔒 | Marcar como leído |
| POST | `/api/webhooks/read-all` 🔒 | Marcar todos como leídos |
| DELETE | `/api/webhooks/{id}` 🔒 | Quitarlo de tu historial · `?scope=all`: retirarlo para todos (creador o admin) |
| POST | `/api/webhooks/delete` 🔒 | Quitar varios de tu historial: `{"ids": [...]}` (máx. 1000) |
| DELETE | `/api/webhooks` 🔒 | Vaciar tu historial |
| POST | `/api/notifications` 🔒 | Enviar una notificación (mismo formato que un webhook). Sin destinatarios: propia. `groupIds` 👑: a tus grupos (admin: a cualquiera). `userIds` 🛡️ |
| GET | `/api/calendar?from=&to=&scope=all` 🔒 | Tu calendario (`scope=all` 🛡️: todos) |
| POST | `/api/calendar` 🔒 | Crear evento |
| PUT | `/api/calendar/{id}` 🔒 | Crear o actualizar evento |
| DELETE | `/api/calendar/{id}` 🔒 | Borrar evento (lógico) |
| POST | `/api/calendar/delete` 🔒 | Borrar varios eventos: `{"ids": [...]}` (máx. 1000) |
| GET | `/api/settings` 🔒 | Tus ajustes (se crean la primera vez, con un `webhookSecret` aleatorio) |
| PUT/PATCH | `/api/settings` 🔒 | Actualizar ajustes (parcial). `webhookSecret` mínimo 16 caracteres y único |
| POST | `/api/settings/webhook-secret` 🔒 | Genera un secreto nuevo (el anterior deja de valer) |
| GET | `/api/groups?scope=all` 🔒 | Grupos que creaste o a los que perteneces (`scope=all` 🛡️: todos) |
| POST | `/api/groups` 👑 | `{name, description}` |
| GET | `/api/groups/{id}` 🔒 | Grupo con sus miembros (dueño, miembros o admin) |
| PATCH | `/api/groups/{id}` 👑 | `{name?, description?}` (el boss dueño o un admin) |
| DELETE | `/api/groups/{id}` 👑 | Borrado lógico (el boss dueño o un admin) |
| POST | `/api/groups/{id}/members` 👑 | `{userIds?, emails?}` → `{added, unknownEmails, members}` |
| DELETE | `/api/groups/{id}/members/{userId}` 👑 | Quitar un miembro |
| GET | `/api/users?q=&limit=` 👑 | Buscar usuarios. Boss: `q` de al menos 2 caracteres, hasta 20 resultados. Admin: todos |
| PATCH | `/api/users/{id}` 🛡️ | `{userType: "admin" \| "boss" \| "user"}` |

Ejemplos:

```powershell
# Webhook propio (el secreto está en GET /api/settings → webhookSecret)
curl -X POST http://localhost:8080/webhook -H "x-webhook-secret: whk_..." -H "Content-Type: application/json" -d '{\"title\":\"Deploy OK\",\"status\":\"success\",\"source\":\"GitHub\"}'

# Un boss reparte a su grupo
curl -X POST http://localhost:8080/api/notifications -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{\"title\":\"Reunión\",\"type\":\"calendar\",\"date\":\"2026-10-20\",\"time\":\"10:00\",\"groupIds\":[\"<id del grupo>\"]}'
```

Al enviar a varios, cada destinatario recibe la notificación sin leer (por SSE en tiempo real) y, si tiene la sincronización de calendario activada y el payload trae fecha, también en su calendario. El remitente guarda una copia ya leída.

## Conexión con noticket

`noticket/src/services/api.ts` llama a este backend (`VITE_API_URL`, por defecto `http://localhost:8080`). Con sesión, `AppContext.tsx` carga webhooks, calendario y ajustes del usuario desde Postgres, guarda cada cambio y escucha `/api/events` (también en la app de escritorio, para recibir las notificaciones de grupo). Sin sesión todo se queda en localStorage y no se reciben webhooks externos.

## Autenticación

- Correo y contraseña (bcrypt, mínimo 8 caracteres con letras y números) y Google OAuth (Authorization Code + PKCE).
- El token de sesión es aleatorio (256 bits); en la base solo se guarda su SHA-256. Se envía como `Authorization: Bearer`.
- Límite de intentos en memoria para login, registro y restablecimiento.
- **Google**: crea un ID de cliente OAuth tipo "Aplicación web" en Google Cloud Console, añade como URI de redireccionamiento `http://localhost:8080/api/auth/google/callback` y pon `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` en `.env`.
- **Correo**: configura `SMTP_*` en `.env`. Sin `SMTP_HOST`, el enlace para restablecer la contraseña se imprime en el log del servidor.
