package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"notiback/internal/models"
)

var ErrNotFound = errors.New("no encontrado")

type Store struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

// ---------- Webhook events ----------

const webhookCols = `id, title, message, type, source, "timestamp",
	to_char(event_date, 'YYYY-MM-DD'), to_char(event_time, 'HH24:MI'),
	category, read, raw_payload`

func scanWebhook(row pgx.Row) (models.WebhookEvent, error) {
	var e models.WebhookEvent
	err := row.Scan(&e.ID, &e.Title, &e.Message, &e.Type, &e.Source, &e.Timestamp,
		&e.Date, &e.Time, &e.Category, &e.Read, &e.RawPayload)
	if e.RawPayload == nil {
		e.RawPayload = map[string]any{}
	}
	return e, err
}

func (s *Store) ListWebhookEvents(ctx context.Context, limit int, unreadOnly bool) ([]models.WebhookEvent, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+webhookCols+` FROM webhook_events
		WHERE ($2::boolean = FALSE OR read = FALSE)
		ORDER BY "timestamp" DESC LIMIT $1`, limit, unreadOnly)
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

func (s *Store) GetWebhookEvent(ctx context.Context, id string) (models.WebhookEvent, error) {
	e, err := scanWebhook(s.pool.QueryRow(ctx, `SELECT `+webhookCols+` FROM webhook_events WHERE id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return e, ErrNotFound
	}
	return e, err
}

func (s *Store) InsertWebhookEvent(ctx context.Context, e models.WebhookEvent) error {
	_, err := s.pool.Exec(ctx, `INSERT INTO webhook_events
		(id, title, message, type, source, "timestamp", event_date, event_time, category, read, raw_payload)
		VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7::text, '')::date, NULLIF($8::text, '')::time, $9, $10, $11)
		ON CONFLICT (id) DO NOTHING`,
		e.ID, e.Title, e.Message, e.Type, e.Source, e.Timestamp,
		deref(e.Date), deref(e.Time), e.Category, e.Read, e.RawPayload)
	return err
}

func (s *Store) MarkWebhookRead(ctx context.Context, id string) error {
	tag, err := s.pool.Exec(ctx, `UPDATE webhook_events SET read = TRUE WHERE id = $1`, id)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

func (s *Store) MarkAllWebhooksRead(ctx context.Context) (int64, error) {
	tag, err := s.pool.Exec(ctx, `UPDATE webhook_events SET read = TRUE WHERE read = FALSE`)
	return tag.RowsAffected(), err
}

func (s *Store) DeleteWebhookEvent(ctx context.Context, id string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM webhook_events WHERE id = $1`, id)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

func (s *Store) ClearWebhookEvents(ctx context.Context) (int64, error) {
	tag, err := s.pool.Exec(ctx, `DELETE FROM webhook_events`)
	return tag.RowsAffected(), err
}

func (s *Store) UnreadCount(ctx context.Context) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `SELECT count(*) FROM webhook_events WHERE read = FALSE`).Scan(&n)
	return n, err
}

// ---------- Calendar events ----------

const calendarCols = `id, title, description, to_char(event_date, 'YYYY-MM-DD'),
	to_char(event_time, 'HH24:MI'), type, category, source, webhook_id`

func scanCalendar(row pgx.Row) (models.CalendarEvent, error) {
	var c models.CalendarEvent
	err := row.Scan(&c.ID, &c.Title, &c.Description, &c.Date, &c.Time, &c.Type, &c.Category, &c.Source, &c.WebhookID)
	return c, err
}

// ListCalendarEvents filtra opcionalmente por rango de fechas (YYYY-MM-DD, inclusivo).
func (s *Store) ListCalendarEvents(ctx context.Context, from, to string) ([]models.CalendarEvent, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+calendarCols+` FROM calendar_events
		WHERE ($1::text = '' OR event_date >= $1::text::date) AND ($2::text = '' OR event_date <= $2::text::date)
		ORDER BY event_date, event_time NULLS FIRST`, from, to)
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

// UpsertCalendarEvent inserta o reemplaza un evento (por id).
func (s *Store) UpsertCalendarEvent(ctx context.Context, c models.CalendarEvent) error {
	_, err := s.pool.Exec(ctx, `INSERT INTO calendar_events
		(id, title, description, event_date, event_time, type, category, source, webhook_id)
		VALUES ($1, $2, $3, $4::text::date, NULLIF($5::text, '')::time, $6, $7, $8, $9)
		ON CONFLICT (id) DO UPDATE SET
			title = EXCLUDED.title, description = EXCLUDED.description,
			event_date = EXCLUDED.event_date, event_time = EXCLUDED.event_time,
			type = EXCLUDED.type, category = EXCLUDED.category,
			source = EXCLUDED.source, webhook_id = EXCLUDED.webhook_id`,
		c.ID, c.Title, c.Description, c.Date, deref(c.Time), c.Type, c.Category, c.Source, c.WebhookID)
	return err
}

func (s *Store) DeleteCalendarEvent(ctx context.Context, id string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM calendar_events WHERE id = $1`, id)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

// ---------- Settings ----------

func (s *Store) GetSettings(ctx context.Context) (models.AppSettings, error) {
	var a models.AppSettings
	err := s.pool.QueryRow(ctx, `SELECT sound_enabled, desktop_notifications_enabled, auto_calendar_sync,
		webhook_secret, theme, accent_color, custom_accent FROM app_settings WHERE id = 1`).
		Scan(&a.SoundEnabled, &a.DesktopNotificationsEnabled, &a.AutoCalendarSync,
			&a.WebhookSecret, &a.Theme, &a.AccentColor, &a.CustomAccent)
	return a, err
}

func (s *Store) SaveSettings(ctx context.Context, a models.AppSettings) error {
	_, err := s.pool.Exec(ctx, `INSERT INTO app_settings (id, sound_enabled, desktop_notifications_enabled,
		auto_calendar_sync, webhook_secret, theme, accent_color, custom_accent, updated_at)
		VALUES (1, $1, $2, $3, $4, $5, $6, $7, now())
		ON CONFLICT (id) DO UPDATE SET
			sound_enabled = EXCLUDED.sound_enabled,
			desktop_notifications_enabled = EXCLUDED.desktop_notifications_enabled,
			auto_calendar_sync = EXCLUDED.auto_calendar_sync,
			webhook_secret = EXCLUDED.webhook_secret,
			theme = EXCLUDED.theme, accent_color = EXCLUDED.accent_color,
			custom_accent = EXCLUDED.custom_accent, updated_at = now()`,
		a.SoundEnabled, a.DesktopNotificationsEnabled, a.AutoCalendarSync,
		a.WebhookSecret, a.Theme, a.AccentColor, a.CustomAccent)
	return err
}

func deref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}
