package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"notiback/internal/models"
)

// ---------- Endpoints de webhook ----------
//
// Cada usuario configura sus endpoints; el id va en la URL (/webhook/{id}) y es único
// en toda la base. Borrado lógico, como el resto de tablas.

const endpointCols = `id, user_id, name, description, secret, enabled, popup, sound, mapping,
	received_count, last_received_at, created_at, updated_at`

func scanEndpoint(row pgx.Row) (models.WebhookEndpoint, error) {
	var ep models.WebhookEndpoint
	err := row.Scan(&ep.ID, &ep.UserID, &ep.Name, &ep.Description, &ep.Secret, &ep.Enabled, &ep.Popup, &ep.Sound,
		&ep.Mapping, &ep.ReceivedCount, &ep.LastReceivedAt, &ep.CreatedAt, &ep.UpdatedAt)
	if ep.Mapping == nil {
		ep.Mapping = models.FieldMapping{}
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return ep, ErrNotFound
	}
	return ep, err
}

// ListEndpoints devuelve los endpoints activos del usuario.
func (s *Store) ListEndpoints(ctx context.Context, userID string) ([]models.WebhookEndpoint, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+endpointCols+` FROM webhook_endpoints
		WHERE user_id = $1 AND status = 'active' ORDER BY created_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.WebhookEndpoint{}
	for rows.Next() {
		ep, err := scanEndpoint(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, ep)
	}
	return out, rows.Err()
}

// GetEndpoint devuelve un endpoint activo del usuario.
func (s *Store) GetEndpoint(ctx context.Context, id, userID string) (models.WebhookEndpoint, error) {
	return scanEndpoint(s.pool.QueryRow(ctx, `SELECT `+endpointCols+` FROM webhook_endpoints
		WHERE id = $1 AND user_id = $2 AND status = 'active'`, id, userID))
}

// EndpointByID busca un endpoint activo de cualquier usuario (para recibir webhooks).
func (s *Store) EndpointByID(ctx context.Context, id string) (models.WebhookEndpoint, error) {
	return scanEndpoint(s.pool.QueryRow(ctx, `SELECT `+endpointCols+` FROM webhook_endpoints
		WHERE id = $1 AND status = 'active'`, id))
}

// CreateEndpoint devuelve ErrConflict si el id ya existe (también si está borrado).
func (s *Store) CreateEndpoint(ctx context.Context, ep models.WebhookEndpoint) (models.WebhookEndpoint, error) {
	created, err := scanEndpoint(s.pool.QueryRow(ctx, `INSERT INTO webhook_endpoints
		(id, user_id, name, description, secret, enabled, popup, sound, mapping)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING `+endpointCols,
		ep.ID, ep.UserID, ep.Name, ep.Description, ep.Secret, ep.Enabled, ep.Popup, ep.Sound, ep.Mapping))
	if isUniqueViolation(err) {
		return created, ErrConflict
	}
	return created, err
}

// UpdateEndpoint guarda los campos editables de un endpoint del usuario.
func (s *Store) UpdateEndpoint(ctx context.Context, ep models.WebhookEndpoint) (models.WebhookEndpoint, error) {
	return scanEndpoint(s.pool.QueryRow(ctx, `UPDATE webhook_endpoints SET
			name = $3, description = $4, secret = $5, enabled = $6, popup = $7, sound = $8, mapping = $9,
			updated_at = now()
		WHERE id = $1 AND user_id = $2 AND status = 'active'
		RETURNING `+endpointCols,
		ep.ID, ep.UserID, ep.Name, ep.Description, ep.Secret, ep.Enabled, ep.Popup, ep.Sound, ep.Mapping))
}

// DeleteEndpoint hace un borrado lógico: su URL deja de aceptar webhooks.
func (s *Store) DeleteEndpoint(ctx context.Context, id, userID string) error {
	tag, err := s.pool.Exec(ctx, `UPDATE webhook_endpoints SET status = 'deleted', deleted_at = now(), updated_at = now()
		WHERE id = $1 AND user_id = $2 AND status = 'active'`, id, userID)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

// TouchEndpoint cuenta un webhook recibido por el endpoint.
func (s *Store) TouchEndpoint(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, `UPDATE webhook_endpoints
		SET received_count = received_count + 1, last_received_at = now() WHERE id = $1`, id)
	return err
}

// OwnsEndpoint indica si el endpoint existe y es del usuario (aunque esté borrado: el
// historial puede seguir apuntándolo).
func (s *Store) OwnsEndpoint(ctx context.Context, id, userID string) (bool, error) {
	var ok bool
	err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM webhook_endpoints WHERE id = $1 AND user_id = $2)`,
		id, userID).Scan(&ok)
	return ok, err
}
