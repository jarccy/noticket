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
	return ParseWith(raw, nil)
}

// ParseWith aplica además el mapeo de campos de un endpoint: cada campo mapeado es una
// ruta del payload ("pull_request.title", "commits.0.message") o una plantilla con
// {{ruta}}. Si el campo mapeado sale vacío se usa la detección por defecto.
// Mismas reglas que src-tauri/src/webhook.rs y src/lib/webhook-parser.ts.
func ParseWith(raw map[string]any, mapping models.FieldMapping) models.WebhookEvent {
	if raw == nil {
		raw = map[string]any{}
	}
	m := func(field string) string {
		if spec, ok := mapping[field]; ok {
			return Render(spec, raw)
		}
		return ""
	}
	or := func(values ...string) string {
		for _, v := range values {
			if v != "" {
				return v
			}
		}
		return ""
	}

	title := or(m("title"), firstString(raw, "title", "subject", "event"))
	if title == "" {
		if a := str(raw, "action"); a != "" {
			title = "Evento: " + a
		} else {
			title = "Notificación de Webhook"
		}
	}

	message := or(m("message"), firstString(raw, "message", "description", "text", "content", "details", "summary"))
	if message == "" {
		b, _ := json.Marshal(raw)
		message = string(b)
	}

	source := or(m("source"), firstString(raw, "source", "sender", "app"))
	if source == "" {
		source = "Webhook API"
	}

	date := ValidDate(nonEmpty(or(m("date"), str(raw, "date"))))
	rawType := m("type")
	if rawType == "" {
		rawType = rawTypeOf(raw)
	}
	_, hasDateKey := raw["date"]
	hasDate := date != nil || (hasDateKey && raw["date"] != nil && raw["date"] != "")

	return models.WebhookEvent{
		ID:         NewID("wh_"),
		Title:      title,
		Message:    message,
		Type:       detectType(rawType, hasDate),
		Source:     source,
		Timestamp:  time.Now().UTC(),
		Date:       date,
		Time:       ValidTime(nonEmpty(or(m("time"), str(raw, "time")))),
		Category:   nonEmpty(or(m("category"), str(raw, "category"))),
		RawPayload: raw,
	}
}

func rawTypeOf(raw map[string]any) string {
	for _, k := range []string{"type", "level", "status", "severity"} {
		if v, ok := raw[k]; ok && v != nil && v != "" && v != false {
			return fmt.Sprint(v)
		}
	}
	return ""
}

func detectType(rawType string, hasDate bool) models.NotificationType {
	rawType = strings.ToLower(rawType)
	has := func(subs ...string) bool {
		for _, s := range subs {
			if strings.Contains(rawType, s) {
				return true
			}
		}
		return false
	}
	switch {
	case has("succ", "ok", "pass"):
		return models.TypeSuccess
	case has("warn", "alert"):
		return models.TypeWarning
	case has("err", "fail", "crit"):
		return models.TypeError
	case has("cal", "meet", "event") || hasDate:
		return models.TypeCalendar
	}
	return models.TypeInfo
}

// ResolvePath recorre el payload por una ruta con puntos; los índices de lista son números.
func ResolvePath(raw any, path string) (any, bool) {
	cur := raw
	for _, key := range strings.Split(strings.TrimSpace(path), ".") {
		if key == "" {
			continue
		}
		switch v := cur.(type) {
		case map[string]any:
			next, ok := v[key]
			if !ok {
				return nil, false
			}
			cur = next
		case []any:
			i, err := strconv.Atoi(key)
			if err != nil || i < 0 || i >= len(v) {
				return nil, false
			}
			cur = v[i]
		default:
			return nil, false
		}
	}
	return cur, true
}

func valueText(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return t
	default:
		b, err := json.Marshal(t)
		if err != nil {
			return fmt.Sprint(t)
		}
		return string(b)
	}
}

// Render evalúa un campo mapeado: plantilla si contiene "{{", si no una ruta.
func Render(spec string, raw map[string]any) string {
	spec = strings.TrimSpace(spec)
	if spec == "" {
		return ""
	}
	if !strings.Contains(spec, "{{") {
		v, _ := ResolvePath(raw, spec)
		return strings.TrimSpace(valueText(v))
	}
	var sb strings.Builder
	rest := spec
	for {
		start := strings.Index(rest, "{{")
		if start < 0 {
			sb.WriteString(rest)
			break
		}
		sb.WriteString(rest[:start])
		after := rest[start+2:]
		end := strings.Index(after, "}}")
		if end < 0 {
			sb.WriteString(rest[start:])
			break
		}
		v, _ := ResolvePath(raw, after[:end])
		sb.WriteString(valueText(v))
		rest = after[end+2:]
	}
	return strings.TrimSpace(sb.String())
}

func nonEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
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
