package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"notiback/internal/models"
)

var ErrEmailTaken = errors.New("correo ya registrado")

const userCols = `id, email, name, password_hash, google_id, avatar_url, email_verified`

func scanUser(row pgx.Row) (models.User, error) {
	var u models.User
	err := row.Scan(&u.ID, &u.Email, &u.Name, &u.PasswordHash, &u.GoogleID, &u.AvatarURL, &u.EmailVerified)
	if errors.Is(err, pgx.ErrNoRows) {
		return u, ErrNotFound
	}
	return u, err
}

// ---------- Usuarios ----------

func (s *Store) UserByEmail(ctx context.Context, email string) (models.User, error) {
	return scanUser(s.pool.QueryRow(ctx, `SELECT `+userCols+` FROM users WHERE lower(email) = lower($1)`, email))
}

// CreatePasswordUser devuelve ErrEmailTaken si el correo ya existe.
func (s *Store) CreatePasswordUser(ctx context.Context, email, name, passwordHash string) (models.User, error) {
	u, err := scanUser(s.pool.QueryRow(ctx, `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
		ON CONFLICT ((lower(email))) DO NOTHING RETURNING `+userCols, email, name, passwordHash))
	if errors.Is(err, ErrNotFound) {
		return u, ErrEmailTaken
	}
	return u, err
}

// UpsertGoogleUser busca por google_id; si no existe, vincula la cuenta con el mismo correo
// (Google ya lo verificó) o crea una nueva.
func (s *Store) UpsertGoogleUser(ctx context.Context, googleID, email, name, picture string) (models.User, error) {
	u, err := scanUser(s.pool.QueryRow(ctx, `UPDATE users SET
			avatar_url = COALESCE(NULLIF($2, ''), avatar_url),
			name = CASE WHEN name = '' THEN $3 ELSE name END,
			updated_at = now()
		WHERE google_id = $1 RETURNING `+userCols, googleID, picture, name))
	if !errors.Is(err, ErrNotFound) {
		return u, err
	}
	return scanUser(s.pool.QueryRow(ctx, `INSERT INTO users (email, name, google_id, avatar_url, email_verified)
		VALUES (lower($1), $2, $3, NULLIF($4, ''), TRUE)
		ON CONFLICT ((lower(email))) DO UPDATE SET
			google_id = EXCLUDED.google_id,
			avatar_url = COALESCE(users.avatar_url, EXCLUDED.avatar_url),
			name = CASE WHEN users.name = '' THEN EXCLUDED.name ELSE users.name END,
			email_verified = TRUE,
			updated_at = now()
		RETURNING `+userCols, email, name, googleID, picture))
}

// ---------- Sesiones ----------

func (s *Store) CreateSession(ctx context.Context, tokenHash, userID string, expiresAt time.Time) error {
	_, err := s.pool.Exec(ctx, `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`,
		tokenHash, userID, expiresAt)
	return err
}

// UserBySession devuelve el usuario de una sesión vigente, o ErrNotFound.
func (s *Store) UserBySession(ctx context.Context, tokenHash string) (models.User, error) {
	return scanUser(s.pool.QueryRow(ctx, `SELECT u.id, u.email, u.name, u.password_hash, u.google_id, u.avatar_url, u.email_verified
		FROM sessions s JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = $1 AND s.expires_at > now()`, tokenHash))
}

func (s *Store) DeleteSession(ctx context.Context, tokenHash string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM sessions WHERE token_hash = $1`, tokenHash)
	return err
}

// ---------- Restablecimiento de contraseña ----------

// CreateResetToken invalida los tokens anteriores del usuario y guarda el nuevo.
func (s *Store) CreateResetToken(ctx context.Context, tokenHash, userID string, expiresAt time.Time) error {
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `DELETE FROM password_reset_tokens WHERE user_id = $1`, userID); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`,
			tokenHash, userID, expiresAt)
		return err
	})
}

func (s *Store) ResetTokenValid(ctx context.Context, tokenHash string) (bool, error) {
	var ok bool
	err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM password_reset_tokens
		WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now())`, tokenHash).Scan(&ok)
	return ok, err
}

// ResetPassword consume el token, cambia la contraseña y cierra todas las sesiones del usuario.
// Devuelve ErrNotFound si el token no existe, ya se usó o caducó.
func (s *Store) ResetPassword(ctx context.Context, tokenHash, passwordHash string) error {
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		var userID string
		err := tx.QueryRow(ctx, `UPDATE password_reset_tokens SET used_at = now()
			WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
			RETURNING user_id`, tokenHash).Scan(&userID)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, userID, passwordHash); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `DELETE FROM sessions WHERE user_id = $1`, userID)
		return err
	})
}

// ---------- OAuth (Google) ----------

func (s *Store) SaveOAuthState(ctx context.Context, stateHash, codeVerifier, redirectTo string, expiresAt time.Time) error {
	_, err := s.pool.Exec(ctx, `INSERT INTO oauth_states (state_hash, code_verifier, redirect_to, expires_at) VALUES ($1, $2, $3, $4)`,
		stateHash, codeVerifier, redirectTo, expiresAt)
	return err
}

// TakeOAuthState consume (borra) el state y devuelve su verifier y destino. ErrNotFound si no vale.
func (s *Store) TakeOAuthState(ctx context.Context, stateHash string) (codeVerifier, redirectTo string, err error) {
	err = s.pool.QueryRow(ctx, `DELETE FROM oauth_states WHERE state_hash = $1 AND expires_at > now()
		RETURNING code_verifier, redirect_to`, stateHash).Scan(&codeVerifier, &redirectTo)
	if errors.Is(err, pgx.ErrNoRows) {
		err = ErrNotFound
	}
	// Limpieza oportunista de states abandonados
	s.pool.Exec(ctx, `DELETE FROM oauth_states WHERE expires_at <= now()`)
	return
}

func (s *Store) SaveLoginCode(ctx context.Context, codeHash, userID string, expiresAt time.Time) error {
	_, err := s.pool.Exec(ctx, `INSERT INTO login_codes (code_hash, user_id, expires_at) VALUES ($1, $2, $3)`,
		codeHash, userID, expiresAt)
	return err
}

// TakeLoginCode consume el código y devuelve el id de usuario. ErrNotFound si no vale.
func (s *Store) TakeLoginCode(ctx context.Context, codeHash string) (string, error) {
	var userID string
	err := s.pool.QueryRow(ctx, `DELETE FROM login_codes WHERE code_hash = $1 AND expires_at > now() RETURNING user_id`,
		codeHash).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	s.pool.Exec(ctx, `DELETE FROM login_codes WHERE expires_at <= now()`)
	return userID, err
}
