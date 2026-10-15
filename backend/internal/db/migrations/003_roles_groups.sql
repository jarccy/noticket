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
