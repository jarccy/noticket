-- Esquema completo de Noticket = migraciones 001 + 002 + 003 en orden.
-- Generado a partir de internal/db/migrations/ (el servidor las aplica solo al arrancar).

-- ===== 001_init.sql =====

-- Esquema inicial de Noticket

CREATE TABLE IF NOT EXISTS webhook_events (
    id           TEXT PRIMARY KEY,
    title        TEXT        NOT NULL,
    message      TEXT        NOT NULL DEFAULT '',
    type         TEXT        NOT NULL DEFAULT 'info'
                 CHECK (type IN ('info', 'success', 'warning', 'error', 'calendar')),
    source       TEXT        NOT NULL DEFAULT 'Webhook API',
    "timestamp"  TIMESTAMPTZ NOT NULL DEFAULT now(),
    event_date   DATE,
    event_time   TIME,
    category     TEXT,
    read         BOOLEAN     NOT NULL DEFAULT FALSE,
    raw_payload  JSONB       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_timestamp ON webhook_events ("timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_unread    ON webhook_events (read) WHERE read = FALSE;

CREATE TABLE IF NOT EXISTS calendar_events (
    id           TEXT PRIMARY KEY,
    title        TEXT        NOT NULL,
    description  TEXT,
    event_date   DATE        NOT NULL,
    event_time   TIME,
    type         TEXT        NOT NULL DEFAULT 'info'
                 CHECK (type IN ('info', 'success', 'warning', 'error', 'calendar')),
    category     TEXT        NOT NULL DEFAULT 'General',
    source       TEXT,
    webhook_id   TEXT        REFERENCES webhook_events (id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events (event_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_webhook ON calendar_events (webhook_id) WHERE webhook_id IS NOT NULL;

-- Ajustes de la app: una sola fila (id = 1)
CREATE TABLE IF NOT EXISTS app_settings (
    id                            SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    sound_enabled                 BOOLEAN     NOT NULL DEFAULT TRUE,
    desktop_notifications_enabled BOOLEAN     NOT NULL DEFAULT TRUE,
    auto_calendar_sync            BOOLEAN     NOT NULL DEFAULT TRUE,
    webhook_secret                TEXT        NOT NULL DEFAULT '',
    theme                         TEXT        NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
    accent_color                  TEXT        NOT NULL DEFAULT 'mono',
    custom_accent                 TEXT        NOT NULL DEFAULT '#0f766e',
    updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ===== 002_auth.sql =====

-- Autenticación: usuarios (correo/contraseña y Google), sesiones, restablecimiento de contraseña y OAuth

CREATE TABLE IF NOT EXISTS users (
    id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    email          TEXT        NOT NULL,
    name           TEXT        NOT NULL DEFAULT '',
    password_hash  TEXT,                       -- NULL si solo entra con Google
    google_id      TEXT UNIQUE,
    avatar_url     TEXT,
    email_verified BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (lower(email));

-- De todos los tokens solo se guarda su SHA-256; el valor en claro lo tiene únicamente el cliente
CREATE TABLE IF NOT EXISTS sessions (
    token_hash  TEXT PRIMARY KEY,
    user_id     TEXT        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_hash  TEXT PRIMARY KEY,
    user_id     TEXT        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens (user_id);

-- Login con Google: state + PKCE del inicio del flujo (vida corta)
CREATE TABLE IF NOT EXISTS oauth_states (
    state_hash     TEXT PRIMARY KEY,
    code_verifier  TEXT        NOT NULL,
    redirect_to    TEXT        NOT NULL,
    expires_at     TIMESTAMPTZ NOT NULL
);

-- Código de un solo uso con el que el frontend canjea la sesión tras volver de Google
CREATE TABLE IF NOT EXISTS login_codes (
    code_hash   TEXT PRIMARY KEY,
    user_id     TEXT        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ NOT NULL
);

-- ===== 003_roles_groups.sql =====

-- Roles de usuario, grupos, notificaciones a varios destinatarios, ajustes por usuario
-- y borrado lógico (status = 'deleted') en lugar de DELETE.

-- ---------- Roles ----------
-- admin: ve todo · boss: crea grupos y envía notificaciones a sus grupos · user: solo lo suyo
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS user_type TEXT NOT NULL DEFAULT 'user'
        CHECK (user_type IN ('admin', 'boss', 'user'));

-- ---------- Grupos ----------
CREATE TABLE IF NOT EXISTS user_groups (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name         TEXT        NOT NULL,
    description  TEXT        NOT NULL DEFAULT '',
    owner_id     TEXT        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status       TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_groups_owner ON user_groups (owner_id) WHERE status = 'active';
-- Un mismo dueño no repite nombre entre sus grupos activos
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_groups_owner_name ON user_groups (owner_id, lower(name)) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS group_members (
    group_id  TEXT        NOT NULL REFERENCES user_groups (id) ON DELETE CASCADE,
    user_id   TEXT        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    added_by  TEXT        REFERENCES users (id) ON DELETE SET NULL,
    added_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members (user_id);

-- ---------- Webhooks / notificaciones ----------
-- El evento se guarda una vez; quién lo recibe (y si lo leyó o lo borró) va en notification_recipients.
ALTER TABLE webhook_events
    ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS group_id   TEXT REFERENCES user_groups (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_webhook_events_created_by ON webhook_events (created_by);

CREATE TABLE IF NOT EXISTS notification_recipients (
    event_id      TEXT        NOT NULL REFERENCES webhook_events (id) ON DELETE CASCADE,
    user_id       TEXT        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    read          BOOLEAN     NOT NULL DEFAULT FALSE,
    read_at       TIMESTAMPTZ,
    status        TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
    deleted_at    TIMESTAMPTZ,
    delivered_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_recipients_feed   ON notification_recipients (user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_recipients_unread ON notification_recipients (user_id) WHERE status = 'active' AND read = FALSE;

-- El estado de lectura pasa a ser por destinatario. Los webhooks anteriores no tienen
-- dueño ni destinatarios: solo los ve un admin (GET /api/webhooks?scope=all).
DROP INDEX IF EXISTS idx_webhook_events_unread;
ALTER TABLE webhook_events DROP COLUMN IF EXISTS read;

-- ---------- Calendario ----------
-- Cada usuario tiene su calendario: el id es único por usuario (el frontend genera los ids
-- y un webhook enviado a un grupo crea el mismo `cal_<id>` en el calendario de cada miembro).
ALTER TABLE calendar_events
    ADD COLUMN IF NOT EXISTS user_id    TEXT REFERENCES users (id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE calendar_events DROP CONSTRAINT IF EXISTS calendar_events_pkey;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS pk BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY;
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_owner_id ON calendar_events (user_id, id);

DROP INDEX IF EXISTS idx_calendar_events_webhook;
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_owner_webhook ON calendar_events (user_id, webhook_id)
    WHERE webhook_id IS NOT NULL AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_calendar_events_owner_date ON calendar_events (user_id, event_date) WHERE status = 'active';

-- ---------- Ajustes por usuario ----------
-- Sustituye a app_settings (fila única). webhook_secret identifica al usuario que recibe
-- un webhook externo: sin un secreto válido no se acepta ningún webhook.
CREATE TABLE IF NOT EXISTS user_settings (
    user_id                       TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    sound_enabled                 BOOLEAN     NOT NULL DEFAULT TRUE,
    desktop_notifications_enabled BOOLEAN     NOT NULL DEFAULT TRUE,
    auto_calendar_sync            BOOLEAN     NOT NULL DEFAULT TRUE,
    webhook_secret                TEXT        NOT NULL
        DEFAULT ('whk_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
    theme                         TEXT        NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
    accent_color                  TEXT        NOT NULL DEFAULT 'mono',
    custom_accent                 TEXT        NOT NULL DEFAULT '#0f766e',
    updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_settings_secret ON user_settings (webhook_secret);

COMMENT ON TABLE app_settings IS 'Obsoleta desde 003_roles_groups: los ajustes están en user_settings';
