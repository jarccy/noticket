package store

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"

	"notiback/internal/models"
)

// ---------- Usuarios y roles ----------

const summaryCols = `u.id, u.email, u.name, u.avatar_url, u.user_type`

func scanSummary(row pgx.Row) (models.UserSummary, error) {
	var u models.UserSummary
	err := row.Scan(&u.ID, &u.Email, &u.Name, &u.AvatarURL, &u.UserType)
	return u, err
}

// ListUsers busca por nombre o correo (q vacío = todos), ordenados por nombre.
func (s *Store) ListUsers(ctx context.Context, q string, limit int) ([]models.UserSummary, error) {
	pattern := "%" + strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(strings.TrimSpace(q)) + "%"
	rows, err := s.pool.Query(ctx, `SELECT `+summaryCols+` FROM users u
		WHERE u.email ILIKE $1 OR u.name ILIKE $1
		ORDER BY lower(u.name), lower(u.email) LIMIT $2`, pattern, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.UserSummary{}
	for rows.Next() {
		u, err := scanSummary(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (s *Store) SetUserType(ctx context.Context, userID string, t models.UserType) (models.User, error) {
	return scanUser(s.pool.QueryRow(ctx, `UPDATE users SET user_type = $2, updated_at = now()
		WHERE id = $1 RETURNING `+userCols, userID, t))
}

// PromoteAdmins da el rol admin a los correos configurados en ADMIN_EMAILS.
func (s *Store) PromoteAdmins(ctx context.Context, emails []string) (int64, error) {
	if len(emails) == 0 {
		return 0, nil
	}
	tag, err := s.pool.Exec(ctx, `UPDATE users SET user_type = 'admin', updated_at = now()
		WHERE lower(email) = ANY($1) AND user_type <> 'admin'`, emails)
	return tag.RowsAffected(), err
}

// ExistingUserIDs filtra los ids que corresponden a usuarios reales.
func (s *Store) ExistingUserIDs(ctx context.Context, ids []string) ([]string, error) {
	rows, err := s.pool.Query(ctx, `SELECT id FROM users WHERE id = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}

// ---------- Grupos ----------

const groupCols = `g.id, g.name, g.description, g.owner_id, COALESCE(o.name, ''), g.created_at,
	(SELECT count(*) FROM group_members m WHERE m.group_id = g.id)`

const groupFrom = ` FROM user_groups g LEFT JOIN users o ON o.id = g.owner_id `

func scanGroup(row pgx.Row) (models.Group, error) {
	var g models.Group
	err := row.Scan(&g.ID, &g.Name, &g.Description, &g.OwnerID, &g.OwnerName, &g.CreatedAt, &g.MemberCount)
	if errors.Is(err, pgx.ErrNoRows) {
		return g, ErrNotFound
	}
	return g, err
}

// CreateGroup devuelve ErrConflict si el dueño ya tiene un grupo activo con ese nombre.
func (s *Store) CreateGroup(ctx context.Context, ownerID, name, description string) (models.Group, error) {
	var id string
	err := s.pool.QueryRow(ctx, `INSERT INTO user_groups (owner_id, name, description) VALUES ($1, $2, $3) RETURNING id`,
		ownerID, name, description).Scan(&id)
	if isUniqueViolation(err) {
		return models.Group{}, ErrConflict
	}
	if err != nil {
		return models.Group{}, err
	}
	return s.GetGroup(ctx, id)
}

// ListGroups: con all = true (admin) todos; si no, los que el usuario creó o a los que pertenece.
func (s *Store) ListGroups(ctx context.Context, userID string, all bool) ([]models.Group, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+groupCols+groupFrom+`
		WHERE g.status = 'active' AND ($2::boolean OR g.owner_id = $1
			OR EXISTS(SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.user_id = $1))
		ORDER BY lower(g.name)`, userID, all)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.Group{}
	for rows.Next() {
		g, err := scanGroup(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

// GetGroup devuelve un grupo activo (sin miembros).
func (s *Store) GetGroup(ctx context.Context, id string) (models.Group, error) {
	return scanGroup(s.pool.QueryRow(ctx, `SELECT `+groupCols+groupFrom+` WHERE g.id = $1 AND g.status = 'active'`, id))
}

func (s *Store) GroupMembers(ctx context.Context, groupID string) ([]models.GroupMember, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+summaryCols+`, m.added_at
		FROM group_members m JOIN users u ON u.id = m.user_id
		WHERE m.group_id = $1 ORDER BY lower(u.name), lower(u.email)`, groupID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.GroupMember{}
	for rows.Next() {
		var m models.GroupMember
		if err := rows.Scan(&m.ID, &m.Email, &m.Name, &m.AvatarURL, &m.UserType, &m.AddedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// IsGroupMember indica si el usuario pertenece al grupo.
func (s *Store) IsGroupMember(ctx context.Context, groupID, userID string) (bool, error) {
	var ok bool
	err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2)`,
		groupID, userID).Scan(&ok)
	return ok, err
}

func (s *Store) UpdateGroup(ctx context.Context, id, name, description string) (models.Group, error) {
	tag, err := s.pool.Exec(ctx, `UPDATE user_groups SET name = $2, description = $3, updated_at = now()
		WHERE id = $1 AND status = 'active'`, id, name, description)
	if isUniqueViolation(err) {
		return models.Group{}, ErrConflict
	}
	if err != nil {
		return models.Group{}, err
	}
	if tag.RowsAffected() == 0 {
		return models.Group{}, ErrNotFound
	}
	return s.GetGroup(ctx, id)
}

// DeleteGroup hace un borrado lógico; los miembros se conservan para el historial.
func (s *Store) DeleteGroup(ctx context.Context, id string) error {
	tag, err := s.pool.Exec(ctx, `UPDATE user_groups SET status = 'deleted', deleted_at = now(), updated_at = now()
		WHERE id = $1 AND status = 'active'`, id)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

// AddGroupMembers añade usuarios por id o por correo. Devuelve cuántos se añadieron y los
// correos que no corresponden a ninguna cuenta.
func (s *Store) AddGroupMembers(ctx context.Context, groupID, addedBy string, userIDs, emails []string) (int64, []string, error) {
	for i := range emails {
		emails[i] = strings.ToLower(strings.TrimSpace(emails[i]))
	}
	tag, err := s.pool.Exec(ctx, `INSERT INTO group_members (group_id, user_id, added_by)
		SELECT $1, u.id, $2 FROM users u WHERE u.id = ANY($3) OR lower(u.email) = ANY($4)
		ON CONFLICT (group_id, user_id) DO NOTHING`, groupID, addedBy, userIDs, emails)
	if err != nil {
		return 0, nil, err
	}
	rows, err := s.pool.Query(ctx, `SELECT e FROM unnest($1::text[]) AS e
		WHERE e <> '' AND NOT EXISTS(SELECT 1 FROM users u WHERE lower(u.email) = e)`, emails)
	if err != nil {
		return 0, nil, err
	}
	unknown, err := pgx.CollectRows(rows, pgx.RowTo[string])
	return tag.RowsAffected(), unknown, err
}

func (s *Store) RemoveGroupMember(ctx context.Context, groupID, userID string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`, groupID, userID)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

// GroupMemberIDs devuelve los miembros (sin repetir) de los grupos activos indicados.
func (s *Store) GroupMemberIDs(ctx context.Context, groupIDs []string) ([]string, error) {
	rows, err := s.pool.Query(ctx, `SELECT DISTINCT m.user_id FROM group_members m
		JOIN user_groups g ON g.id = m.group_id
		WHERE g.id = ANY($1) AND g.status = 'active'`, groupIDs)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}
