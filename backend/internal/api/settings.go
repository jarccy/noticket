package api

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"notiback/internal/auth"
)

const minWebhookSecret = 16

func (s *Server) getSettings(c *gin.Context) {
	settings, err := s.store.GetSettings(c.Request.Context(), currentUser(c).ID)
	if err != nil {
		writeStoreError(c, err)
		return
	}
	c.JSON(http.StatusOK, settings)
}

// updateSettings acepta un objeto parcial: solo cambia los campos enviados.
func (s *Server) updateSettings(c *gin.Context) {
	userID := currentUser(c).ID
	settings, err := s.store.GetSettings(c.Request.Context(), userID)
	if err != nil {
		writeStoreError(c, err)
		return
	}
	if err := c.ShouldBindJSON(&settings); err != nil {
		writeError(c, http.StatusBadRequest, "JSON inválido")
		return
	}
	if settings.Theme != "dark" && settings.Theme != "light" {
		writeError(c, http.StatusBadRequest, "theme debe ser 'dark' o 'light'")
		return
	}
	// El secreto identifica al usuario en POST /webhook: no puede quedar vacío ni ser corto
	settings.WebhookSecret = strings.TrimSpace(settings.WebhookSecret)
	if len(settings.WebhookSecret) < minWebhookSecret {
		writeError(c, http.StatusBadRequest, "El secreto de webhook debe tener al menos 16 caracteres")
		return
	}
	if err := s.store.SaveSettings(c.Request.Context(), userID, settings); err != nil {
		writeStoreError(c, err)
		return
	}
	c.JSON(http.StatusOK, settings)
}

// rotateWebhookSecret genera un secreto nuevo; el anterior deja de aceptarse.
func (s *Server) rotateWebhookSecret(c *gin.Context) {
	userID := currentUser(c).ID
	settings, err := s.store.GetSettings(c.Request.Context(), userID)
	if err != nil {
		writeStoreError(c, err)
		return
	}
	settings.WebhookSecret = "whk_" + auth.NewToken()
	if err := s.store.SaveSettings(c.Request.Context(), userID, settings); err != nil {
		writeStoreError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"webhookSecret": settings.WebhookSecret})
}
