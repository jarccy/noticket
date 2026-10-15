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
	Read       bool             `json:"read"`
	RawPayload map[string]any   `json:"rawPayload"`
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
}

// PublicUser es lo que ve el frontend (sin hash de contraseña).
type PublicUser struct {
	ID          string  `json:"id"`
	Email       string  `json:"email"`
	Name        string  `json:"name"`
	AvatarURL   *string `json:"avatarUrl"`
	HasPassword bool    `json:"hasPassword"`
	HasGoogle   bool    `json:"hasGoogle"`
}

func (u User) Public() PublicUser {
	return PublicUser{
		ID: u.ID, Email: u.Email, Name: u.Name, AvatarURL: u.AvatarURL,
		HasPassword: u.PasswordHash != nil, HasGoogle: u.GoogleID != nil,
	}
}
