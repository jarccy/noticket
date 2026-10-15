package models

import "time"

// Los tags JSON coinciden con los tipos de noticket/src/types/index.ts.

type NotificationType string

const (
	TypeInfo     NotificationType = "info"
	TypeSuccess  NotificationType = "success"
	TypeWarning  NotificationType = "warning"
	TypeError    NotificationType = "error"
	TypeCalendar NotificationType = "calendar"
)

func (t NotificationType) Valid() bool {
	switch t {
	case TypeInfo, TypeSuccess, TypeWarning, TypeError, TypeCalendar:
		return true
	}
	return false
}

// UserType es el rol del usuario.
//   - admin: ve todos los webhooks, calendarios, grupos y usuarios; cambia roles.
//   - boss:  crea grupos, añade miembros y envía notificaciones a sus grupos.
//   - user:  solo ve y crea sus propias notificaciones (y las que le envían).
type UserType string

const (
	UserAdmin UserType = "admin"
	UserBoss  UserType = "boss"
	UserUser  UserType = "user"
)

func (t UserType) Valid() bool {
	switch t {
	case UserAdmin, UserBoss, UserUser:
		return true
	}
	return false
}

// Borrado lógico: las filas no se eliminan, pasan a status = 'deleted'.
const (
	StatusActive  = "active"
	StatusDeleted = "deleted"
)

type WebhookEvent struct {
	ID         string           `json:"id"`
	Title      string           `json:"title"`
	Message    string           `json:"message"`
	Type       NotificationType `json:"type"`
	Source     string           `json:"source"`
	Timestamp  time.Time        `json:"timestamp"`
	Date       *string          `json:"date,omitempty"` // YYYY-MM-DD
	Time       *string          `json:"time,omitempty"` // HH:mm
	Category   *string          `json:"category,omitempty"`
	Read       bool             `json:"read"` // por destinatario (notification_recipients)
	RawPayload map[string]any   `json:"rawPayload"`
	CreatedBy  *string          `json:"createdBy,omitempty"` // quién lo envió o dueño del hook
	GroupID    *string          `json:"groupId,omitempty"`   // grupo al que se envió
}

type CalendarEvent struct {
	ID          string           `json:"id"`
	Title       string           `json:"title"`
	Description *string          `json:"description,omitempty"`
	Date        string           `json:"date"`           // YYYY-MM-DD
	Time        *string          `json:"time,omitempty"` // HH:mm
	Type        NotificationType `json:"type"`
	Category    string           `json:"category"`
	Source      *string          `json:"source,omitempty"`
	WebhookID   *string          `json:"webhookId,omitempty"`
	UserID      string           `json:"userId,omitempty"` // dueño (solo informativo; lo fija el servidor)
}

type AppSettings struct {
	SoundEnabled                bool   `json:"soundEnabled"`
	DesktopNotificationsEnabled bool   `json:"desktopNotificationsEnabled"`
	AutoCalendarSync            bool   `json:"autoCalendarSync"`
	WebhookSecret               string `json:"webhookSecret"`
	Theme                       string `json:"theme"`
	AccentColor                 string `json:"accentColor"`
	CustomAccent                string `json:"customAccent"`
}

type User struct {
	ID            string
	Email         string
	Name          string
	PasswordHash  *string // nil si solo entra con Google
	GoogleID      *string
	AvatarURL     *string
	EmailVerified bool
	UserType      UserType
}

func (u User) IsAdmin() bool { return u.UserType == UserAdmin }

// CanManageGroups: los boss crean grupos; el admin puede gestionar cualquiera.
func (u User) CanManageGroups() bool { return u.UserType == UserBoss || u.UserType == UserAdmin }

// PublicUser es lo que ve el frontend (sin hash de contraseña).
type PublicUser struct {
	ID          string   `json:"id"`
	Email       string   `json:"email"`
	Name        string   `json:"name"`
	AvatarURL   *string  `json:"avatarUrl"`
	HasPassword bool     `json:"hasPassword"`
	HasGoogle   bool     `json:"hasGoogle"`
	UserType    UserType `json:"userType"`
}

func (u User) Public() PublicUser {
	return PublicUser{
		ID: u.ID, Email: u.Email, Name: u.Name, AvatarURL: u.AvatarURL,
		HasPassword: u.PasswordHash != nil, HasGoogle: u.GoogleID != nil, UserType: u.UserType,
	}
}

// UserSummary es la vista de otro usuario (listados, miembros de un grupo).
type UserSummary struct {
	ID        string   `json:"id"`
	Email     string   `json:"email"`
	Name      string   `json:"name"`
	AvatarURL *string  `json:"avatarUrl"`
	UserType  UserType `json:"userType"`
}

type Group struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	Description string        `json:"description"`
	OwnerID     string        `json:"ownerId"`
	OwnerName   string        `json:"ownerName"`
	MemberCount int           `json:"memberCount"`
	CreatedAt   time.Time     `json:"createdAt"`
	Members     []GroupMember `json:"members,omitempty"`
}

type GroupMember struct {
	UserSummary
	AddedAt time.Time `json:"addedAt"`
}
