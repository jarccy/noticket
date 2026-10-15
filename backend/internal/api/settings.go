package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func (s *Server) getSettings(c *gin.Context) {
	settings, err := s.store.GetSettings(c.Request.Context())
	if err != nil {
		writeStoreError(c, err)
		return
	}
	c.JSON(http.StatusOK, settings)
}

// updateSettings acepta un objeto parcial: solo cambia los campos enviados.
func (s *Server) updateSettings(c *gin.Context) {
	settings, err := s.store.GetSettings(c.Request.Context())
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
	if err := s.store.SaveSettings(c.Request.Context(), settings); err != nil {
		writeStoreError(c, err)
		return
	}
	c.JSON(http.StatusOK, settings)
}
