package api

import (
	"crypto/subtle"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"notiback/internal/models"
	"notiback/internal/webhook"
)

const maxBody = 1 << 20

func (s *Server) receiveWebhook(c *gin.Context) {
	ctx := c.Request.Context()

	settings, err := s.store.GetSettings(ctx)
	if err != nil {
		writeStoreError(c, err)
		return
	}
	if settings.WebhookSecret != "" && !validSecret(c, settings.WebhookSecret) {
		writeError(c, http.StatusUnauthorized, "Secreto de webhook inválido")
		return
	}

	body, err := io.ReadAll(http.MaxBytesReader(c.Writer, c.Request.Body, maxBody))
	if err != nil {
		writeError(c, http.StatusRequestEntityTooLarge, "Payload demasiado grande")
		return
	}
	raw := map[string]any{}
	if strings.TrimSpace(string(body)) != "" {
		if err := json.Unmarshal(body, &raw); err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
				"status": "error", "message": "JSON inválido o malformado", "error": err.Error(),
			})
			return
		}
	}

	event := webhook.Parse(raw)
	if err := s.store.InsertWebhookEvent(ctx, event); err != nil {
		writeStoreError(c, err)
		return
	}

	if settings.AutoCalendarSync && (event.Date != nil || event.Type == models.TypeCalendar) {
		if err := s.store.UpsertCalendarEvent(ctx, calendarFromWebhook(event)); err != nil {
			log.Printf("no se pudo sincronizar con calendario: %v", err)
		}
	}

	s.hub.Broadcast(event)

	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "Webhook recibido y procesado",
		"event": gin.H{
			"id": event.ID, "title": event.Title, "type": event.Type, "timestamp": event.Timestamp,
		},
	})
}

// saveWebhook guarda un WebhookEvent ya procesado por la app (llegado por Tauri o Vite).
// Es idempotente: si el id ya existe no hace nada.
func (s *Server) saveWebhook(c *gin.Context) {
	var e models.WebhookEvent
	if err := c.ShouldBindJSON(&e); err != nil {
		writeError(c, http.StatusBadRequest, "JSON inválido")
		return
	}
	e.Title = strings.TrimSpace(e.Title)
	if e.ID == "" || e.Title == "" {
		writeError(c, http.StatusBadRequest, "id y title son obligatorios")
		return
	}
	if e.Type == "" {
		e.Type = models.TypeInfo
	}
	if !e.Type.Valid() {
		writeError(c, http.StatusBadRequest, "type inválido")
		return
	}
	if e.Source == "" {
		e.Source = "Webhook API"
	}
	if e.Timestamp.IsZero() {
		e.Timestamp = time.Now().UTC()
	}
	if e.RawPayload == nil {
		e.RawPayload = map[string]any{}
	}
	e.Date = webhook.ValidDate(e.Date)
	e.Time = webhook.ValidTime(e.Time)

	if err := s.store.InsertWebhookEvent(c.Request.Context(), e); err != nil {
		writeStoreError(c, err)
		return
	}
	c.JSON(http.StatusCreated, e)
}

func validSecret(c *gin.Context, secret string) bool {
	got := c.GetHeader("x-webhook-secret")
	if got == "" {
		got = strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
	}
	return subtle.ConstantTimeCompare([]byte(got), []byte(secret)) == 1
}

// calendarFromWebhook replica la auto-sincronización de AppContext.tsx.
func calendarFromWebhook(e models.WebhookEvent) models.CalendarEvent {
	now := time.Now()
	date := now.Format("2006-01-02")
	if e.Date != nil {
		date = *e.Date
	}
	t := now.Format("15:04")
	if e.Time != nil {
		t = *e.Time
	}
	category := "Webhook"
	if e.Type == models.TypeCalendar {
		category = "Reunión"
	}
	if e.Category != nil {
		category = *e.Category
	}
	id, msg, src := e.ID, e.Message, e.Source
	return models.CalendarEvent{
		ID:          "cal_" + e.ID,
		Title:       e.Title,
		Description: &msg,
		Date:        date,
		Time:        &t,
		Type:        e.Type,
		Category:    category,
		Source:      &src,
		WebhookID:   &id,
	}
}

func (s *Server) streamEvents(c *gin.Context) {
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")

	history, err := s.store.ListWebhookEvents(c.Request.Context(), 50, false)
	if err != nil {
		log.Printf("historial SSE: %v", err)
		history = []models.WebhookEvent{}
	}
	hello, _ := json.Marshal(gin.H{"type": "connected", "history": history})
	c.Writer.WriteString("data: " + string(hello) + "\n\n")
	c.Writer.Flush()

	ch := s.hub.Subscribe()
	defer s.hub.Unsubscribe(ch)

	ping := time.NewTicker(25 * time.Second)
	defer ping.Stop()

	for {
		select {
		case <-c.Request.Context().Done():
			return
		case msg := <-ch:
			c.Writer.WriteString("data: " + string(msg) + "\n\n")
			c.Writer.Flush()
		case <-ping.C:
			c.Writer.WriteString(": ping\n\n")
			c.Writer.Flush()
		}
	}
}

func (s *Server) listWebhooks(c *gin.Context) {
	limit := 200
	if v, err := strconv.Atoi(c.Query("limit")); err == nil && v > 0 && v <= 1000 {
		limit = v
	}
	events, err := s.store.ListWebhookEvents(c.Request.Context(), limit, c.Query("unread") == "true")
	if err != nil {
		writeStoreError(c, err)
		return
	}
	c.JSON(http.StatusOK, events)
}

func (s *Server) getWebhook(c *gin.Context) {
	e, err := s.store.GetWebhookEvent(c.Request.Context(), c.Param("id"))
	if err != nil {
		writeStoreError(c, err)
		return
	}
	c.JSON(http.StatusOK, e)
}

func (s *Server) markRead(c *gin.Context) {
	if err := s.store.MarkWebhookRead(c.Request.Context(), c.Param("id")); err != nil {
		writeStoreError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (s *Server) markAllRead(c *gin.Context) {
	n, err := s.store.MarkAllWebhooksRead(c.Request.Context())
	if err != nil {
		writeStoreError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"updated": n})
}

func (s *Server) deleteWebhook(c *gin.Context) {
	if err := s.store.DeleteWebhookEvent(c.Request.Context(), c.Param("id")); err != nil {
		writeStoreError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (s *Server) clearWebhooks(c *gin.Context) {
	n, err := s.store.ClearWebhookEvents(c.Request.Context())
	if err != nil {
		writeStoreError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": n})
}
