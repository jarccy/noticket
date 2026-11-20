-- Diseño de los avisos de cada endpoint: estilo, color, icono, tiempo en pantalla…
-- {"style": "banner", "color": "#2563eb", "icon": "rocket", "duration": 10, "showMeta": true}
ALTER TABLE webhook_endpoints
    ADD COLUMN IF NOT EXISTS appearance JSONB NOT NULL DEFAULT '{}'::jsonb;
