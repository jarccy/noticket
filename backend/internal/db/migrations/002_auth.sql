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
