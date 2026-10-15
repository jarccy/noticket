package webhook

import (
	"testing"

	"notiback/internal/models"
)

func TestParse(t *testing.T) {
	cases := []struct {
		name  string
		raw   map[string]any
		title string
		typ   models.NotificationType
	}{
		{"success", map[string]any{"title": "Deploy", "status": "success"}, "Deploy", models.TypeSuccess},
		{"warning", map[string]any{"subject": "RAM", "level": "warning"}, "RAM", models.TypeWarning},
		{"error", map[string]any{"event": "build", "severity": "critical"}, "build", models.TypeError},
		{"calendar by date", map[string]any{"title": "Sprint", "date": "2026-10-20"}, "Sprint", models.TypeCalendar},
		{"action fallback", map[string]any{"action": "opened"}, "Evento: opened", models.TypeInfo},
		{"empty", map[string]any{}, "Notificación de Webhook", models.TypeInfo},
	}
	for _, c := range cases {
		e := Parse(c.raw)
		if e.Title != c.title || e.Type != c.typ {
			t.Errorf("%s: got (%q, %s), want (%q, %s)", c.name, e.Title, e.Type, c.title, c.typ)
		}
	}
}

func TestParseInvalidDateIgnored(t *testing.T) {
	e := Parse(map[string]any{"date": "mañana", "time": "25:99"})
	if e.Date != nil || e.Time != nil {
		t.Errorf("fecha/hora inválidas deberían ignorarse, got %v %v", e.Date, e.Time)
	}
}
