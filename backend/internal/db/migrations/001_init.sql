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
