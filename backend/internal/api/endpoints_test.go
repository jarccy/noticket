package api

import (
	"testing"

	"notiback/internal/models"
)

func TestValidAppearance(t *testing.T) {
	ok := []models.NotificationAppearance{
		{},
		{"style": "banner", "color": "#2563eb", "icon": "rocket", "duration": float64(10), "showMeta": true},
		{"style": "classic", "color": nil, "icon": nil, "duration": float64(0)},
	}
	for _, a := range ok {
		if msg := validAppearance(a); msg != "" {
			t.Errorf("validAppearance(%v) = %q, want valid", a, msg)
		}
	}

	bad := []models.NotificationAppearance{
		{"style": "neon"},
		{"color": "red"},
		{"icon": "<script>"},
		{"duration": float64(300)},
		{"duration": float64(2.5)},
		{"showMeta": "yes"},
		{"position": "top"},
	}
	for _, a := range bad {
		if msg := validAppearance(a); msg == "" {
			t.Errorf("validAppearance(%v) accepted an invalid design", a)
		}
	}
}
