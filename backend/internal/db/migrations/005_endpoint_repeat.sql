-- Repetir el aviso de un endpoint cada N minutos hasta que se marque como visto.
ALTER TABLE webhook_endpoints
    ADD COLUMN IF NOT EXISTS repeat         BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS repeat_minutes INTEGER NOT NULL DEFAULT 15
        CHECK (repeat_minutes BETWEEN 1 AND 1440);
