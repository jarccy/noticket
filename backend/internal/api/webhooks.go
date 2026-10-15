package api

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"notiback/internal/models"
	"notiback/internal/store"
	"notiback/internal/webhook"
)

const maxBody = 1 << 20

// targetError es un fallo al resolver destinatarios que se responde tal cual al cliente.
type targetError struct {
	status int
	msg    string
}

func (e *targetError) Error() string { return e.msg }

// resolveTargets decide a quién se entrega un evento según el rol de quien lo envía:
//   - sin destinatarios: solo al propio remitente (su notificación);
//   - groupIDs: boss (grupos propios) o admin (cualquiera) → todos los miembros;
//   - userIDs: solo el admin puede enviar a otros usuarios.
//
// El remitente siempre recibe una copia; si va dirigida a otros, la suya llega ya leída.
func (s *Server) resolveTargets(c *gin.Context, sender models.User, groupIDs, userIDs []string) (store.Delivery, *string, error) {
	ctx := c.Request.Context()
	userIDs = slices.DeleteFunc(slices.Clone(userIDs), func(id string) bool { return id == sender.ID })
	if len(groupIDs) == 0 && len(userIDs) == 0 {
		return store.Delivery{Recipients: []string{sender.ID}}, nil, nil
	}

	var recipients []string
	if len(groupIDs) > 0 {
		if !sender.CanManageGroups() {
			return store.Delivery{}, nil, &targetError{http.StatusForbidden, "Solo un boss o un administrador puede enviar a grupos"}
		}
		for _, id := range groupIDs {
			g, err := s.store.GetGroup(ctx, id)
			if errors.Is(err, store.ErrNotFound) {
				return store.Delivery{}, nil, &targetError{http.StatusNotFound, "Grupo no encontrado: " + id}
			}
			if err != nil {
				return store.Delivery{}, nil, err
			}
			if g.OwnerID != sender.ID && !sender.IsAdmin() {
				return store.Delivery{}, nil, &targetError{http.StatusForbidden, "Solo puedes enviar a los grupos que creaste"}
			}
		}
		members, err := s.store.GroupMemberIDs(ctx, groupIDs)
		if err != nil {
			return store.Delivery{}, nil, err
		}
		recipients = append(recipients, members...)
	}
	if len(userIDs) > 0 {
		if !sender.IsAdmin() {
			return store.Delivery{}, nil, &targetError{http.StatusForbidden, "Solo un administrador puede enviar a usuarios concretos"}
		}
		existing, err := s.store.ExistingUserIDs(ctx, userIDs)
		if err != nil {
			return store.Delivery{}, nil, err
		}
		recipients = append(recipients, existing...)
	}

	recipients = append(recipients, sender.ID)
	slices.Sort(recipients)
	recipients = slices.Compact(recipients)

	var groupID *string
	if len(groupIDs) == 1 {
		groupID = &groupIDs[0]
	}
	return store.Delivery{Recipients: recipients, ReadBy: []string{sender.ID}}, groupID, nil
}

// deliver guarda el evento, lo entrega a sus destinatarios (y a su calendario si tiene fecha)
// y lo emite por SSE a quienes no lo tienen ya como leído.
func (s *Server) deliver(c *gin.Context, sender models.User, event models.WebhookEvent, d store.Delivery, groupID *string) error {
	event.CreatedBy = &sender.ID
	event.GroupID = groupID
	var cal *models.CalendarEvent
	if event.Date != nil || event.Type == models.TypeCalendar {
		ce := calendarFromWebhook(event)
		cal = &ce
	}
	if err := s.store.DeliverWebhookEvent(c.Request.Context(), event, d, cal); err != nil {
		return err
	}
	live := slices.DeleteFunc(slices.Clone(d.Recipients), func(id string) bool { return slices.Contains(d.ReadBy, id) })
	s.hub.SendTo(live, event)
	return nil
}

func writeTargetError(c *gin.Context, err error) {
	var te *targetError
	if errors.As(err, &te) {
		writeError(c, te.status, te.msg)
		return
	}
	writeStoreError(c, err)
}

// receiveWebhook: POST /webhook. El secreto (x-webhook-secret o Authorization: Bearer)
// identifica al usuario. Un boss/admin puede incluir "groupId"/"groupIds" en el payload
// para repartirlo a sus grupos, y un admin "userIds".
func (s *Server) receiveWebhook(c *gin.Context) {
	ctx := c.Request.Context()

	secret := strings.TrimSpace(c.GetHeader("x-webhook-secret"))
	if secret == "" {
		secret = bearerToken(c)
	}
	if secret == "" {
		writeError(c, http.StatusUnauthorized, "Falta el secreto de webhook (x-webhook-secret). Los webhooks solo se aceptan para usuarios registrados.")
		return
	}
	owner, err := s.store.UserByWebhookSecret(ctx, secret)
	if errors.Is(err, store.ErrNotFound) {
		writeError(c, http.StatusUnauthorized, "Secreto de webhook inválido")
		return
	}
	if err != nil {
		writeStoreError(c, err)
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

	d, groupID, err := s.resolveTargets(c, owner, stringList(raw, "groupId", "groupIds"), stringList(raw, "userId", "userIds"))
	if err != nil {
		writeTargetError(c, err)
		return
	}
	event := webhook.Parse(raw)
	if err := s.deliver(c, owner, event, d, groupID); err != nil {
		writeStoreError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":     "success",
		"message":    "Webhook recibido y procesado",
		"recipients": len(d.Recipients),
		"event": gin.H{
			"id": event.ID, "title": event.Title, "type": event.Type, "timestamp": event.Timestamp,
		},
	})
}

// sendNotification: POST /api/notifications. Mismo payload que un webhook más
// "groupIds"/"userIds" opcionales; sin destinatarios es una notificación propia.
func (s *Server) sendNotification(c *gin.Context) {
	var raw map[string]any
	if err := c.ShouldBindJSON(&raw); err != nil {
		writeError(c, http.StatusBadRequest, "JSON inválido")
		return
	}
	if strings.TrimSpace(firstString(raw, "title")) == "" {
		writeError(c, http.StatusBadRequest, "title es obligatorio")
		return
	}
	sender := currentUser(c)
	d, groupID, err := s.resolveTargets(c, sender, stringList(raw, "groupId", "groupIds"), stringList(raw, "userId", "userIds"))
	if err != nil {
		writeTargetError(c, err)
		return
	}
	event := webhook.Parse(raw)
	if err := s.deliver(c, sender, event, d, groupID); err != nil {
		writeStoreError(c, err)
		return
	}
	event.Read = slices.Contains(d.ReadBy, sender.ID)
	c.JSON(http.StatusCreated, gin.H{"event": event, "recipients": len(d.Recipients)})
}

// stringList lee claves que pueden venir como texto o como lista de textos.
func stringList(raw map[string]any, keys ...string) []string {
	var out []string
	for _, k := range keys {
		switch v := raw[k].(type) {
		case string:
			if v = strings.TrimSpace(v); v != "" {
				out = append(out, v)
			}
		case []any:
			for _, item := range v {
				if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
					out = append(out, strings.TrimSpace(s))
				}
			}
		}
	}
	slices.Sort(out)
	return slices.Compact(out)
}

func firstString(raw map[string]any, key string) string {
	v, _ := raw[key].(string)
	return v
}

// saveWebhook guarda un WebhookEvent ya procesado por la app (llegado por Tauri o Vite)
// en el historial del usuario. Es idempotente: si el id ya existe no hace nada.
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
	e.GroupID = nil

	if err := s.store.SaveOwnWebhookEvent(c.Request.Context(), e, currentUser(c).ID); err != nil {
		writeStoreError(c, err)
		return
	}
	c.JSON(http.StatusCreated, e)
}

// calendarFromWebhook replica la auto-sincronización de AppContext.tsx: con fecha y sin
// hora es un evento de todo el día; sin fecha ocurre ahora.
func calendarFromWebhook(e models.WebhookEvent) models.CalendarEvent {
	now := time.Now()
	date := now.Format("2006-01-02")
	var t *string
	switch {
	case e.Time != nil:
		t = e.Time
	case e.Date == nil:
		nowTime := now.Format("15:04")
		t = &nowTime
	}
	if e.Date != nil {
		date = *e.Date
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
		Time:        t,
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

	user := currentUser(c)
	history, err := s.store.ListFeed(c.Request.Context(), user.ID, 50, false)
	if err != nil {
		log.Printf("historial SSE: %v", err)
		history = []models.WebhookEvent{}
	}
	hello, _ := json.Marshal(gin.H{"type": "connected", "history": history})
	c.Writer.WriteString("data: " + string(hello) + "\n\n")
	c.Writer.Flush()

	ch := s.hub.Subscribe(user.ID)
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
	user, unread := currentUser(c), c.Query("unread") == "true"
	var (
		events []models.WebhookEvent
		err    error
	)
	if scopeAll(c) {
		events, err = s.store.ListAllWebhookEvents(c.Request.Context(), user.ID, limit, unread)
	} else {
		events, err = s.store.ListFeed(c.Request.Context(), user.ID, limit, unread)
	}
	if err != nil {
		writeStoreError(c, err)
		return
	}
	c.JSON(http.StatusOK, events)
}

func (s *Server) getWebhook(c *gin.Context) {
	user := currentUser(c)
	e, err := s.store.GetWebhookEvent(c.Request.Context(), c.Param("id"), user.ID, user.IsAdmin())
	if err != nil {
		writeStoreError(c, err)
		return
	}
	c.JSON(http.StatusOK, e)
}

func (s *Server) markRead(c *gin.Context) {
	if err := s.store.MarkWebhookRead(c.Request.Context(), c.Param("id"), currentUser(c).ID); err != nil {
		writeStoreError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (s *Server) markAllRead(c *gin.Context) {
	n, err := s.store.MarkAllWebhooksRead(c.Request.Context(), currentUser(c).ID)
	if err != nil {
		writeStoreError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"updated": n})
}

// deleteWebhook hace un borrado lógico en el historial del usuario. Con ?scope=all, quien
// lo creó (o un admin) lo retira para todos los destinatarios.
func (s *Server) deleteWebhook(c *gin.Context) {
	user, id := currentUser(c), c.Param("id")
	var err error
	if c.Query("scope") == "all" {
		err = s.store.RetractWebhookEvent(c.Request.Context(), id, user.ID, user.IsAdmin())
	} else {
		err = s.store.DeleteWebhookEvent(c.Request.Context(), id, user.ID)
	}
	if err != nil {
		writeStoreError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// idsBody es el cuerpo de los borrados en lote.
type idsBody struct {
	IDs []string `json:"ids"`
}

// maxBatchIDs limita cuántos elementos se borran en una petición.
const maxBatchIDs = 1000

func bindIDs(c *gin.Context) ([]string, bool) {
	var body idsBody
	if err := c.ShouldBindJSON(&body); err != nil || len(body.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ids es obligatorio"})
		return nil, false
	}
	if len(body.IDs) > maxBatchIDs {
		c.JSON(http.StatusBadRequest, gin.H{"error": "demasiados ids en una petición"})
		return nil, false
	}
	return body.IDs, true
}

func (s *Server) deleteWebhooks(c *gin.Context) {
	ids, ok := bindIDs(c)
	if !ok {
		return
	}
	n, err := s.store.DeleteWebhookEvents(c.Request.Context(), ids, currentUser(c).ID)
	if err != nil {
		writeStoreError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": n})
}

func (s *Server) clearWebhooks(c *gin.Context) {
	n, err := s.store.ClearWebhookEvents(c.Request.Context(), currentUser(c).ID)
	if err != nil {
		writeStoreError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": n})
}
