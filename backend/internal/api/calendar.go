package api

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"notiback/internal/models"
	"notiback/internal/webhook"
)

func (s *Server) listCalendar(c *gin.Context) {
	from, to := c.Query("from"), c.Query("to")
	if (from != "" && webhook.ValidDate(&from) == nil) || (to != "" && webhook.ValidDate(&to) == nil) {
		writeError(c, http.StatusBadRequest, "from/to deben tener formato YYYY-MM-DD")
		return
	}
	events, err := s.store.ListCalendarEvents(c.Request.Context(), currentUser(c).ID, scopeAll(c), from, to)
	if err != nil {
		writeStoreError(c, err)
		return
	}
	c.JSON(http.StatusOK, events)
}

func (s *Server) createCalendar(c *gin.Context) {
	var ev models.CalendarEvent
	if err := c.ShouldBindJSON(&ev); err != nil {
		writeError(c, http.StatusBadRequest, "JSON inválido")
		return
	}
	if ev.ID == "" {
		ev.ID = webhook.NewID("cal_")
	}
	s.saveCalendar(c, ev, http.StatusCreated)
}

func (s *Server) updateCalendar(c *gin.Context) {
	var ev models.CalendarEvent
	if err := c.ShouldBindJSON(&ev); err != nil {
		writeError(c, http.StatusBadRequest, "JSON inválido")
		return
	}
	ev.ID = c.Param("id")
	s.saveCalendar(c, ev, http.StatusOK)
}

func (s *Server) saveCalendar(c *gin.Context, ev models.CalendarEvent, status int) {
	ev.Title = strings.TrimSpace(ev.Title)
	if ev.Title == "" {
		writeError(c, http.StatusBadRequest, "title es obligatorio")
		return
	}
	if webhook.ValidDate(&ev.Date) == nil {
		writeError(c, http.StatusBadRequest, "date es obligatorio con formato YYYY-MM-DD")
		return
	}
	if ev.Time != nil && *ev.Time == "" {
		ev.Time = nil
	}
	if ev.Time != nil && webhook.ValidTime(ev.Time) == nil {
		writeError(c, http.StatusBadRequest, "time debe tener formato HH:mm")
		return
	}
	if ev.Type == "" {
		ev.Type = models.TypeInfo
	}
	if !ev.Type.Valid() {
		writeError(c, http.StatusBadRequest, "type inválido")
		return
	}
	if ev.Category == "" {
		ev.Category = "General"
	}
	ev.UserID = currentUser(c).ID
	if err := s.store.UpsertCalendarEvent(c.Request.Context(), ev, ev.UserID); err != nil {
		writeStoreError(c, err)
		return
	}
	c.JSON(status, ev)
}

// deleteCalendar hace un borrado lógico (status = 'deleted').
func (s *Server) deleteCalendar(c *gin.Context) {
	if err := s.store.DeleteCalendarEvent(c.Request.Context(), c.Param("id"), currentUser(c).ID); err != nil {
		writeStoreError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
