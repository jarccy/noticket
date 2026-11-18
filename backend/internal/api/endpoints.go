package api

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"regexp"
	"slices"
	"strings"

	"github.com/gin-gonic/gin"

	"notiback/internal/auth"
	"notiback/internal/models"
	"notiback/internal/store"
	"notiback/internal/webhook"
)

// El id va en la URL del endpoint: minúsculas, números, "_" y "-".
var endpointIDRe = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{5,63}$`)

const (
	maxEndpointName   = 80
	maxEndpointDesc   = 500
	maxMappingSpec    = 500
	minEndpointSecret = 16
	maxEndpointSecret = 200
)

func newEndpointID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return "ep_" + hex.EncodeToString(b)
}

func newEndpointSecret() string { return "whs_" + auth.NewToken() }

// endpointInput: en la creación los campos ausentes toman su valor por defecto; en la
// edición (PATCH) solo se cambian los que llegan.
type endpointInput struct {
	ID          *string              `json:"id"`
	Name        *string              `json:"name"`
	Description *string              `json:"description"`
	Secret      *string              `json:"secret"`
	Enabled     *bool                `json:"enabled"`
	Popup       *bool                `json:"popup"`
	Sound       *bool                `json:"sound"`
	Mapping     *models.FieldMapping `json:"mapping"`
}

// apply valida la entrada y la vuelca sobre ep. Devuelve un mensaje si algo no es válido.
func (in endpointInput) apply(ep *models.WebhookEndpoint) string {
	if in.Name != nil {
		ep.Name = strings.TrimSpace(*in.Name)
	}
	if ep.Name == "" || len([]rune(ep.Name)) > maxEndpointName {
		return "El nombre es obligatorio (máx. 80 caracteres)"
	}
	if in.Description != nil {
		ep.Description = strings.TrimSpace(*in.Description)
	}
	if len([]rune(ep.Description)) > maxEndpointDesc {
		return "La descripción admite como máximo 500 caracteres"
	}
	if in.Secret != nil {
		ep.Secret = strings.TrimSpace(*in.Secret)
	}
	if len(ep.Secret) < minEndpointSecret || len(ep.Secret) > maxEndpointSecret {
		return "El secreto debe tener entre 16 y 200 caracteres"
	}
	if in.Enabled != nil {
		ep.Enabled = *in.Enabled
	}
	if in.Popup != nil {
		ep.Popup = *in.Popup
	}
	if in.Sound != nil {
		ep.Sound = *in.Sound
	}
	if in.Mapping != nil {
		mapping := models.FieldMapping{}
		for field, spec := range *in.Mapping {
			if !slices.Contains(models.MappedFields, field) {
				return "Campo de mapeo desconocido: " + field
			}
			if spec = strings.TrimSpace(spec); spec == "" {
				continue
			}
			if len(spec) > maxMappingSpec {
				return "Cada campo del mapeo admite como máximo 500 caracteres"
			}
			mapping[field] = spec
		}
		ep.Mapping = mapping
	}
	return ""
}

func (s *Server) listEndpoints(c *gin.Context) {
	eps, err := s.store.ListEndpoints(c.Request.Context(), currentUser(c).ID)
	if err != nil {
		writeStoreError(c, err)
		return
	}
	c.JSON(http.StatusOK, eps)
}

// createEndpoint: POST /api/endpoints. El id y el secreto son opcionales (la app los envía
// al sincronizar los endpoints creados sin sesión, para que sus URLs sigan valiendo).
func (s *Server) createEndpoint(c *gin.Context) {
	var in endpointInput
	if err := c.ShouldBindJSON(&in); err != nil {
		writeError(c, http.StatusBadRequest, "JSON inválido")
		return
	}
	ep := models.WebhookEndpoint{
		ID: newEndpointID(), Secret: newEndpointSecret(), UserID: currentUser(c).ID,
		Enabled: true, Popup: true, Sound: true, Mapping: models.FieldMapping{},
	}
	if in.ID != nil && *in.ID != "" {
		if !endpointIDRe.MatchString(*in.ID) {
			writeError(c, http.StatusBadRequest, "id inválido (6-64 caracteres: a-z, 0-9, _ y -)")
			return
		}
		ep.ID = *in.ID
	}
	if msg := in.apply(&ep); msg != "" {
		writeError(c, http.StatusBadRequest, msg)
		return
	}
	created, err := s.store.CreateEndpoint(c.Request.Context(), ep)
	if err != nil {
		writeStoreError(c, err)
		return
	}
	c.JSON(http.StatusCreated, created)
}

func (s *Server) updateEndpoint(c *gin.Context) {
	var in endpointInput
	if err := c.ShouldBindJSON(&in); err != nil {
		writeError(c, http.StatusBadRequest, "JSON inválido")
		return
	}
	ep, err := s.store.GetEndpoint(c.Request.Context(), c.Param("id"), currentUser(c).ID)
	if err != nil {
		writeStoreError(c, err)
		return
	}
	if msg := in.apply(&ep); msg != "" {
		writeError(c, http.StatusBadRequest, msg)
		return
	}
	updated, err := s.store.UpdateEndpoint(c.Request.Context(), ep)
	if err != nil {
		writeStoreError(c, err)
		return
	}
	c.JSON(http.StatusOK, updated)
}

func (s *Server) deleteEndpoint(c *gin.Context) {
	if err := s.store.DeleteEndpoint(c.Request.Context(), c.Param("id"), currentUser(c).ID); err != nil {
		writeStoreError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// rotateEndpointSecret genera un secreto nuevo; el anterior deja de aceptarse.
func (s *Server) rotateEndpointSecret(c *gin.Context) {
	ep, err := s.store.GetEndpoint(c.Request.Context(), c.Param("id"), currentUser(c).ID)
	if err != nil {
		writeStoreError(c, err)
		return
	}
	ep.Secret = newEndpointSecret()
	updated, err := s.store.UpdateEndpoint(c.Request.Context(), ep)
	if err != nil {
		writeStoreError(c, err)
		return
	}
	c.JSON(http.StatusOK, updated)
}

// readPayload lee el cuerpo JSON de un webhook (vacío = {}). Si falla ya ha respondido.
func readPayload(c *gin.Context) (map[string]any, bool) {
	body, err := io.ReadAll(http.MaxBytesReader(c.Writer, c.Request.Body, maxBody))
	if err != nil {
		writeError(c, http.StatusRequestEntityTooLarge, "Payload demasiado grande")
		return nil, false
	}
	raw := map[string]any{}
	if strings.TrimSpace(string(body)) != "" {
		if err := json.Unmarshal(body, &raw); err != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
				"status": "error", "message": "JSON inválido o malformado", "error": err.Error(),
			})
			return nil, false
		}
	}
	return raw, true
}

// requestSecret: x-webhook-secret, Authorization: Bearer o ?secret= (para servicios que
// no permiten cabeceras propias).
func requestSecret(c *gin.Context) string {
	if s := strings.TrimSpace(c.GetHeader("x-webhook-secret")); s != "" {
		return s
	}
	if s := bearerToken(c); s != "" {
		return s
	}
	return strings.TrimSpace(c.Query("secret"))
}

// receiveEndpointWebhook: POST /webhook/{id}. Lo recibe el dueño del endpoint con su
// mapeo de campos y sus preferencias de popup / sonido. Como en /webhook, un boss/admin
// puede repartirlo a sus grupos con "groupId"/"groupIds" en el payload.
func (s *Server) receiveEndpointWebhook(c *gin.Context) {
	ctx := c.Request.Context()
	ep, err := s.store.EndpointByID(ctx, c.Param("id"))
	if errors.Is(err, store.ErrNotFound) {
		writeError(c, http.StatusNotFound, "Endpoint no encontrado")
		return
	}
	if err != nil {
		writeStoreError(c, err)
		return
	}
	if secret := requestSecret(c); secret == "" || subtle.ConstantTimeCompare([]byte(secret), []byte(ep.Secret)) != 1 {
		writeError(c, http.StatusUnauthorized, "Secreto inválido para este endpoint")
		return
	}
	if !ep.Enabled {
		writeError(c, http.StatusLocked, "Este endpoint está pausado")
		return
	}
	owner, err := s.store.UserByID(ctx, ep.UserID)
	if err != nil {
		writeStoreError(c, err)
		return
	}
	raw, ok := readPayload(c)
	if !ok {
		return
	}

	d, groupID, err := s.resolveTargets(c, owner, stringList(raw, "groupId", "groupIds"), stringList(raw, "userId", "userIds"))
	if err != nil {
		writeTargetError(c, err)
		return
	}
	event := webhook.ParseWith(raw, ep.Mapping)
	if event.Source == "Webhook API" {
		event.Source = ep.Name
	}
	event.EndpointID = &ep.ID
	event.Popup, event.Sound = &ep.Popup, &ep.Sound
	if err := s.deliver(c, owner, event, d, groupID); err != nil {
		writeStoreError(c, err)
		return
	}
	if err := s.store.TouchEndpoint(ctx, ep.ID); err != nil {
		log.Printf("contador del endpoint %s: %v", ep.ID, err)
	}

	c.JSON(http.StatusOK, gin.H{
		"status":     "success",
		"message":    "Webhook recibido y procesado",
		"endpoint":   ep.Name,
		"recipients": len(d.Recipients),
		"event": gin.H{
			"id": event.ID, "title": event.Title, "type": event.Type, "timestamp": event.Timestamp,
		},
	})
}
