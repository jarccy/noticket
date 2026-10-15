package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"notiback/internal/models"
)

var (
	ErrNotFound  = errors.New("no encontrado")
	ErrForbidden = errors.New("sin permiso")
	ErrConflict  = errors.New("conflicto")
)

type Store struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

func (s *Store) Ping(ctx context.Context) error { return s.pool.Ping(ctx) }

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

// ---------- Webhook events ----------
//
// Un evento se guarda una vez en webhook_events y se entrega a uno o varios usuarios
// mediante notification_recipients, donde vive el estado de cada uno (leído / borrado).

const webhookCols = `e.id, e.title, e.message, e.type, e.source, e."timestamp",
	to_char(e.event_date, 'YYYY-MM-DD'), to_char(e.event_time, 'HH24:MI'),
	e.category, e.raw_payload, e.created_by, e.group_id`

// scanWebhook espera webhookCols seguidas de la columna "read".
func scanWebhook(row pgx.Row) (models.WebhookEvent, error) {
	var e models.WebhookEvent
	err := row.Scan(&e.ID, &e.Title, &e.Message, &e.Type, &e.Source, &e.Timestamp,
		&e.Date, &e.Time, &e.Category, &e.RawPayload, &e.CreatedBy, &e.GroupID, &e.Read)
	if e.RawPayload == nil {
		e.RawPayload = map[string]any{}
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return e, ErrNotFound
	}
	return e, err
}

func collectWebhooks(rows pgx.Rows, err error) ([]models.WebhookEvent, error) {
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.WebhookEvent{}
	for rows.Next() {
		e, err := scanWebhook(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func insertEvent(ctx context.Context, tx pgx.Tx, e models.WebhookEvent) (bool, error) {
	tag, err := tx.Exec(ctx, `INSERT INTO webhook_events
		(id, title, message, type, source, "timestamp", event_date, event_time, category, raw_payload, created_by, group_id)
		VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7::text, '')::date, NULLIF($8::text, '')::time, $9, $10, $11, $12)
		ON CONFLICT (id) DO NOTHING`,
		e.ID, e.Title, e.Message, e.Type, e.Source, e.Timestamp,
		deref(e.Date), deref(e.Time), e.Category, e.RawPayload, e.CreatedBy, e.GroupID)
	return tag.RowsAffected() == 1, err
}

// Delivery describe a quién se entrega un evento. Los ids en ReadBy llegan ya leídos
// (p. ej. el remitente, que guarda una copia en su historial).
type Delivery struct {
	Recipients []string
	ReadBy     []string
}

// DeliverWebhookEvent guarda el evento y lo entrega a sus destinatarios en una transacción.
// Si autoCalendar es true, crea `cal_<id>` en el calendario de cada destinatario que tenga
// activada la sincronización automática.
func (s *Store) DeliverWebhookEvent(ctx context.Context, e models.WebhookEvent, d Delivery, cal *models.CalendarEvent) error {
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		if _, err := insertEvent(ctx, tx, e); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO notification_recipients (event_id, user_id, read, read_at)
			SELECT $1, u.id, COALESCE(u.id = ANY($3), FALSE), CASE WHEN u.id = ANY($3) THEN now() END
			FROM users u WHERE u.id = ANY($2)
			ON CONFLICT (event_id, user_id) DO NOTHING`, e.ID, d.Recipients, d.ReadBy); err != nil {
			return err
		}
		if cal == nil {
			return nil
		}
		_, err := tx.Exec(ctx, `INSERT INTO calendar_events
			(user_id, id, title, description, event_date, event_time, type, category, source, webhook_id)
			SELECT r.uid, $2, $3, $4, $5::text::date, NULLIF($6::text, '')::time, $7, $8, $9, $10
			FROM unnest($1::text[]) AS r(uid)
			LEFT JOIN user_settings st ON st.user_id = r.uid
			WHERE COALESCE(st.auto_calendar_sync, TRUE)
			ON CONFLICT DO NOTHING`,
			d.Recipients, cal.ID, cal.Title, cal.Description, cal.Date, deref(cal.Time),
			cal.Type, cal.Category, cal.Source, cal.WebhookID)
		return err
	})
}

// SaveOwnWebhookEvent guarda un evento que la app ya procesó (llegó por Tauri o Vite) en el
// historial del usuario. Es idempotente; si el id pertenece a un evento de otro usuario del
// que no es destinatario devuelve ErrForbidden.
func (s *Store) SaveOwnWebhookEvent(ctx context.Context, e models.WebhookEvent, userID string) error {
	e.CreatedBy = &userID
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		inserted, err := insertEvent(ctx, tx, e)
		if err != nil {
			return err
		}
		if !inserted {
			var owner *string
			var isRecipient bool
			err := tx.QueryRow(ctx, `SELECT created_by,
					EXISTS(SELECT 1 FROM notification_recipients WHERE event_id = $1 AND user_id = $2)
				FROM webhook_events WHERE id = $1`, e.ID, userID).Scan(&owner, &isRecipient)
			if err != nil {
				return err
			}
			if isRecipient {
				return nil
			}
			if owner == nil || *owner != userID {
				return ErrForbidden
			}
		}
		_, err = tx.Exec(ctx, `INSERT INTO notification_recipients (event_id, user_id, read, read_at)
			VALUES ($1, $2, $3, CASE WHEN $3 THEN now() END)
			ON CONFLICT (event_id, user_id) DO NOTHING`, e.ID, userID, e.Read)
		return err
	})
}

// ListFeed devuelve los webhooks entregados al usuario (sin los borrados).
func (s *Store) ListFeed(ctx context.Context, userID string, limit int, unreadOnly bool) ([]models.WebhookEvent, error) {
	return collectWebhooks(s.pool.Query(ctx, `SELECT `+webhookCols+`, r.read
		FROM notification_recipients r JOIN webhook_events e ON e.id = r.event_id
		WHERE r.user_id = $1 AND r.status = 'active' AND e.status = 'active'
			AND ($3::boolean = FALSE OR r.read = FALSE)
		ORDER BY e."timestamp" DESC LIMIT $2`, userID, limit, unreadOnly))
}

// ListAllWebhookEvents (solo admin): todos los eventos activos; "read" es el estado del propio
// admin, o true si no era destinatario.
func (s *Store) ListAllWebhookEvents(ctx context.Context, viewerID string, limit int, unreadOnly bool) ([]models.WebhookEvent, error) {
	return collectWebhooks(s.pool.Query(ctx, `SELECT `+webhookCols+`, COALESCE(r.read, TRUE)
		FROM webhook_events e
		LEFT JOIN notification_recipients r ON r.event_id = e.id AND r.user_id = $1 AND r.status = 'active'
		WHERE e.status = 'active' AND ($3::boolean = FALSE OR r.read = FALSE)
		ORDER BY e."timestamp" DESC LIMIT $2`, viewerID, limit, unreadOnly))
}

// GetWebhookEvent devuelve el evento si el usuario es destinatario (o si es admin).
func (s *Store) GetWebhookEvent(ctx context.Context, id, userID string, admin bool) (models.WebhookEvent, error) {
	return scanWebhook(s.pool.QueryRow(ctx, `SELECT `+webhookCols+`, COALESCE(r.read, TRUE)
		FROM webhook_events e
		LEFT JOIN notification_recipients r ON r.event_id = e.id AND r.user_id = $2 AND r.status = 'active'
		WHERE e.id = $1 AND e.status = 'active' AND (r.user_id IS NOT NULL OR $3::boolean)`, id, userID, admin))
}

func (s *Store) MarkWebhookRead(ctx context.Context, id, userID string) error {
	tag, err := s.pool.Exec(ctx, `UPDATE notification_recipients SET read = TRUE, read_at = COALESCE(read_at, now())
		WHERE event_id = $1 AND user_id = $2 AND status = 'active'`, id, userID)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

func (s *Store) MarkAllWebhooksRead(ctx context.Context, userID string) (int64, error) {
	tag, err := s.pool.Exec(ctx, `UPDATE notification_recipients SET read = TRUE, read_at = now()
		WHERE user_id = $1 AND status = 'active' AND read = FALSE`, userID)
	return tag.RowsAffected(), err
}

// DeleteWebhookEvent quita el evento del historial del usuario (status = 'deleted').
func (s *Store) DeleteWebhookEvent(ctx context.Context, id, userID string) error {
	tag, err := s.pool.Exec(ctx, `UPDATE notification_recipients SET status = 'deleted', deleted_at = now()
		WHERE event_id = $1 AND user_id = $2 AND status = 'active'`, id, userID)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

// RetractWebhookEvent marca el evento como borrado para todos sus destinatarios.
// Solo puede hacerlo quien lo creó o un admin.
func (s *Store) RetractWebhookEvent(ctx context.Context, id, userID string, admin bool) error {
	tag, err := s.pool.Exec(ctx, `UPDATE webhook_events SET status = 'deleted', deleted_at = now()
		WHERE id = $1 AND status = 'active' AND (created_by = $2 OR $3::boolean)`, id, userID, admin)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

// DeleteWebhookEvents quita varios eventos del historial del usuario (borrado lógico).
func (s *Store) DeleteWebhookEvents(ctx context.Context, ids []string, userID string) (int64, error) {
	tag, err := s.pool.Exec(ctx, `UPDATE notification_recipients SET status = 'deleted', deleted_at = now()
		WHERE event_id = ANY($1) AND user_id = $2 AND status = 'active'`, ids, userID)
	return tag.RowsAffected(), err
}

// ClearWebhookEvents vacía el historial del usuario (borrado lógico).
func (s *Store) ClearWebhookEvents(ctx context.Context, userID string) (int64, error) {
	tag, err := s.pool.Exec(ctx, `UPDATE notification_recipients SET status = 'deleted', deleted_at = now()
		WHERE user_id = $1 AND status = 'active'`, userID)
	return tag.RowsAffected(), err
}

// ---------- Calendar events ----------
//
// Cada usuario tiene su propio calendario; el id del evento es único por usuario.

const calendarCols = `id, title, description, to_char(event_date, 'YYYY-MM-DD'),
	to_char(event_time, 'HH24:MI'), type, category, source, webhook_id, COALESCE(user_id, '')`

func scanCalendar(row pgx.Row) (models.CalendarEvent, error) {
	var c models.CalendarEvent
	err := row.Scan(&c.ID, &c.Title, &c.Description, &c.Date, &c.Time, &c.Type, &c.Category, &c.Source, &c.WebhookID, &c.UserID)
	return c, err
}

// ListCalendarEvents filtra opcionalmente por rango de fechas (YYYY-MM-DD, inclusivo).
// Con all = true (admin) devuelve los calendarios de todos los usuarios.
func (s *Store) ListCalendarEvents(ctx context.Context, userID string, all bool, from, to string) ([]models.CalendarEvent, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+calendarCols+` FROM calendar_events
		WHERE status = 'active' AND ($3::boolean OR user_id = $4)
			AND ($1::text = '' OR event_date >= $1::text::date) AND ($2::text = '' OR event_date <= $2::text::date)
		ORDER BY event_date, event_time NULLS FIRST`, from, to, all, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.CalendarEvent{}
	for rows.Next() {
		c, err := scanCalendar(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// UpsertCalendarEvent inserta o reemplaza un evento del usuario. Un evento borrado no se
// resucita: devuelve ErrNotFound.
func (s *Store) UpsertCalendarEvent(ctx context.Context, c models.CalendarEvent, userID string) error {
	tag, err := s.pool.Exec(ctx, `INSERT INTO calendar_events
		(user_id, id, title, description, event_date, event_time, type, category, source, webhook_id)
		VALUES ($1, $2, $3, $4, $5::text::date, NULLIF($6::text, '')::time, $7, $8, $9, $10)
		ON CONFLICT (user_id, id) DO UPDATE SET
			title = EXCLUDED.title, description = EXCLUDED.description,
			event_date = EXCLUDED.event_date, event_time = EXCLUDED.event_time,
			type = EXCLUDED.type, category = EXCLUDED.category,
			source = EXCLUDED.source, webhook_id = EXCLUDED.webhook_id, updated_at = now()
		WHERE calendar_events.status = 'active'`,
		userID, c.ID, c.Title, c.Description, c.Date, deref(c.Time), c.Type, c.Category, c.Source, c.WebhookID)
	if isUniqueViolation(err) {
		return ErrConflict // otro evento activo del usuario ya enlaza ese webhook
	}
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

// DeleteCalendarEvent hace un borrado lógico (status = 'deleted').
func (s *Store) DeleteCalendarEvent(ctx context.Context, id, userID string) error {
	tag, err := s.pool.Exec(ctx, `UPDATE calendar_events SET status = 'deleted', deleted_at = now(), updated_at = now()
		WHERE user_id = $2 AND id = $1 AND status = 'active'`, id, userID)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

// DeleteCalendarEvents borra varios eventos del usuario (borrado lógico).
func (s *Store) DeleteCalendarEvents(ctx context.Context, ids []string, userID string) (int64, error) {
	tag, err := s.pool.Exec(ctx, `UPDATE calendar_events SET status = 'deleted', deleted_at = now(), updated_at = now()
		WHERE user_id = $2 AND id = ANY($1) AND status = 'active'`, ids, userID)
	return tag.RowsAffected(), err
}

// ---------- Settings (por usuario) ----------

const settingsCols = `sound_enabled, desktop_notifications_enabled, auto_calendar_sync,
	webhook_secret, theme, accent_color, custom_accent`

func scanSettings(row pgx.Row, a *models.AppSettings) error {
	return row.Scan(&a.SoundEnabled, &a.DesktopNotificationsEnabled, &a.AutoCalendarSync,
		&a.WebhookSecret, &a.Theme, &a.AccentColor, &a.CustomAccent)
}

// GetSettings devuelve los ajustes del usuario; la primera vez los crea con valores por
// defecto y un secreto de webhook aleatorio.
func (s *Store) GetSettings(ctx context.Context, userID string) (models.AppSettings, error) {
	var a models.AppSettings
	err := scanSettings(s.pool.QueryRow(ctx, `WITH ins AS (
			INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING RETURNING `+settingsCols+`
		)
		SELECT `+settingsCols+` FROM ins
		UNION ALL SELECT `+settingsCols+` FROM user_settings WHERE user_id = $1
		LIMIT 1`, userID), &a)
	return a, err
}

// SaveSettings devuelve ErrConflict si el secreto de webhook ya lo usa otro usuario.
func (s *Store) SaveSettings(ctx context.Context, userID string, a models.AppSettings) error {
	_, err := s.pool.Exec(ctx, `INSERT INTO user_settings (user_id, sound_enabled, desktop_notifications_enabled,
		auto_calendar_sync, webhook_secret, theme, accent_color, custom_accent, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
		ON CONFLICT (user_id) DO UPDATE SET
			sound_enabled = EXCLUDED.sound_enabled,
			desktop_notifications_enabled = EXCLUDED.desktop_notifications_enabled,
			auto_calendar_sync = EXCLUDED.auto_calendar_sync,
			webhook_secret = EXCLUDED.webhook_secret,
			theme = EXCLUDED.theme, accent_color = EXCLUDED.accent_color,
			custom_accent = EXCLUDED.custom_accent, updated_at = now()`,
		userID, a.SoundEnabled, a.DesktopNotificationsEnabled, a.AutoCalendarSync,
		a.WebhookSecret, a.Theme, a.AccentColor, a.CustomAccent)
	if isUniqueViolation(err) {
		return ErrConflict
	}
	return err
}

// UserByWebhookSecret identifica al dueño de un webhook externo por su secreto.
func (s *Store) UserByWebhookSecret(ctx context.Context, secret string) (models.User, error) {
	return scanUser(s.pool.QueryRow(ctx, `SELECT `+userColsU+`
		FROM user_settings st JOIN users u ON u.id = st.user_id
		WHERE st.webhook_secret = $1`, secret))
}

func deref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}
