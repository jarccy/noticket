-- Endpoints de webhook configurables: cada usuario crea los suyos, cada uno con su URL
-- (/webhook/{id}), su secreto, mapeo de campos y preferencias de popup / sonido.

CREATE TABLE IF NOT EXISTS webhook_endpoints (
    id               TEXT PRIMARY KEY,
    user_id          TEXT        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name             TEXT        NOT NULL,
    description      TEXT        NOT NULL DEFAULT '',
    secret           TEXT        NOT NULL,
    enabled          BOOLEAN     NOT NULL DEFAULT TRUE,
    popup            BOOLEAN     NOT NULL DEFAULT TRUE,
    sound            BOOLEAN     NOT NULL DEFAULT TRUE,
    -- {"title": "pull_request.title", "message": "Nuevo PR: {{pull_request.title}}", ...}
    mapping          JSONB       NOT NULL DEFAULT '{}'::jsonb,
    received_count   INTEGER     NOT NULL DEFAULT 0,
    last_received_at TIMESTAMPTZ,
    status           TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_user ON webhook_endpoints (user_id) WHERE status = 'active';

-- Por qué endpoint llegó cada webhook (NULL: /webhook genérico o notificación enviada desde la app)
ALTER TABLE webhook_events
    ADD COLUMN IF NOT EXISTS endpoint_id TEXT REFERENCES webhook_endpoints (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_events_endpoint ON webhook_events (endpoint_id) WHERE endpoint_id IS NOT NULL;
