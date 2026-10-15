package webhook

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"math/big"
	"strconv"
	"strings"
	"time"

	"notiback/internal/models"
)

// Parse convierte un payload arbitrario en un WebhookEvent.
// Misma lógica que parseWebhookPayload en noticket/vite-webhook-plugin.ts.
func Parse(raw map[string]any) models.WebhookEvent {
	if raw == nil {
		raw = map[string]any{}
	}

	title := firstString(raw, "title", "subject", "event")
	if title == "" {
		if a := str(raw, "action"); a != "" {
			title = "Evento: " + a
		} else {
			title = "Notificación de Webhook"
		}
	}

	message := firstString(raw, "message", "description", "text", "content", "details", "summary")
	if message == "" {
		b, _ := json.Marshal(raw)
		message = string(b)
	}

	source := firstString(raw, "source", "sender", "app")
	if source == "" {
		source = "Webhook API"
	}

	e := models.WebhookEvent{
		ID:         NewID("wh_"),
		Title:      title,
		Message:    message,
		Type:       detectType(raw),
		Source:     source,
		Timestamp:  time.Now().UTC(),
		Date:       ValidDate(optString(raw, "date")),
		Time:       ValidTime(optString(raw, "time")),
		Category:   optString(raw, "category"),
		RawPayload: raw,
	}
	return e
}

func detectType(raw map[string]any) models.NotificationType {
	var rawType string
	for _, k := range []string{"type", "level", "status", "severity"} {
		if v, ok := raw[k]; ok && v != nil && v != "" && v != false {
			rawType = strings.ToLower(fmt.Sprint(v))
			break
		}
	}
	has := func(subs ...string) bool {
		for _, s := range subs {
			if strings.Contains(rawType, s) {
				return true
			}
		}
		return false
	}
	_, hasDate := raw["date"]
	switch {
	case has("succ", "ok", "pass"):
		return models.TypeSuccess
	case has("warn", "alert"):
		return models.TypeWarning
	case has("err", "fail", "crit"):
		return models.TypeError
	case has("cal", "meet", "event") || (hasDate && raw["date"] != nil && raw["date"] != ""):
		return models.TypeCalendar
	}
	return models.TypeInfo
}

// NewID genera ids con el mismo formato que el frontend: prefijo + base36(ms) + aleatorio.
func NewID(prefix string) string {
	const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
	var sb strings.Builder
	sb.WriteString(prefix)
	sb.WriteString(strconv.FormatInt(time.Now().UnixMilli(), 36))
	for i := 0; i < 5; i++ {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(alphabet))))
		sb.WriteByte(alphabet[n.Int64()])
	}
	return sb.String()
}

func str(raw map[string]any, key string) string {
	s, _ := raw[key].(string)
	return s
}

func firstString(raw map[string]any, keys ...string) string {
	for _, k := range keys {
		if s := str(raw, k); s != "" {
			return s
		}
	}
	return ""
}

func optString(raw map[string]any, key string) *string {
	if s := str(raw, key); s != "" {
		return &s
	}
	return nil
}

// ValidDate devuelve d si tiene formato YYYY-MM-DD; si no, nil.
func ValidDate(d *string) *string {
	if d == nil {
		return nil
	}
	if _, err := time.Parse("2006-01-02", *d); err != nil {
		return nil
	}
	return d
}

// ValidTime acepta HH:mm o HH:mm:ss; si no, nil.
func ValidTime(t *string) *string {
	if t == nil {
		return nil
	}
	for _, layout := range []string{"15:04", "15:04:05"} {
		if _, err := time.Parse(layout, *t); err == nil {
			return t
		}
	}
	return nil
}
