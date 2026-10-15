package api

import (
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"notiback/internal/auth"
	"notiback/internal/config"
	"notiback/internal/models"
	"notiback/internal/sse"
	"notiback/internal/store"
)

type Server struct {
	store       *store.Store
	hub         *sse.Hub
	cfg         config.Config
	corsOrigins []string
	google      auth.Google
	mailer      *auth.Mailer
	limiter     *auth.RateLimiter
}

func New(st *store.Store, hub *sse.Hub, cfg config.Config) *Server {
	return &Server{
		store:       st,
		hub:         hub,
		cfg:         cfg,
		corsOrigins: cfg.CORSOrigins,
		google: auth.Google{
			ClientID:     cfg.GoogleClientID,
			ClientSecret: cfg.GoogleClientSecret,
			RedirectURI:  cfg.PublicURL + "/api/auth/google/callback",
		},
		mailer:  auth.NewMailer(cfg.SMTP),
		limiter: auth.NewRateLimiter(),
	}
}

func (s *Server) Router() *gin.Engine {
	r := gin.New()
	// /api/events lleva el token en la query (EventSource no admite cabeceras): no se registra en el log
	r.Use(gin.LoggerWithConfig(gin.LoggerConfig{SkipPaths: []string{"/api/events"}}), gin.Recovery(), s.cors())

	r.GET("/health", s.health)

	// Recepción de webhooks externos: el secreto de webhook identifica al usuario que lo recibe.
	// Sin un secreto válido (es decir, sin cuenta) no se acepta ningún webhook.
	r.POST("/webhook", s.receiveWebhook)

	public := r.Group("/api")
	{
		public.GET("/health", s.health)
		public.POST("/webhook", s.receiveWebhook)

		a := public.Group("/auth")
		a.GET("/providers", s.providers)
		a.POST("/register", s.register)
		a.POST("/login", s.login)
		a.POST("/forgot-password", s.forgotPassword)
		a.POST("/reset-password/validate", s.validateResetToken)
		a.POST("/reset-password", s.resetPassword)
		a.GET("/google", s.googleStart)
		a.GET("/google/callback", s.googleCallback)
		a.POST("/google/exchange", s.googleExchange)
	}

	// Todo lo demás requiere sesión
	api := r.Group("/api", s.requireAuth)
	{
		api.GET("/auth/me", s.me)
		api.POST("/auth/logout", s.logout)

		// Stream en tiempo real (Server-Sent Events)
		api.GET("/events", s.streamEvents)

		// Webhooks / notificaciones del usuario (admin: ?scope=all para ver todos)
		wh := api.Group("/webhooks")
		wh.GET("", s.listWebhooks)
		wh.POST("", s.saveWebhook) // la app guarda eventos que recibió por Tauri/Vite
		wh.DELETE("", s.clearWebhooks)
		wh.POST("/read-all", s.markAllRead)
		wh.POST("/delete", s.deleteWebhooks) // borrado en lote: {"ids": [...]}
		wh.GET("/:id", s.getWebhook)
		wh.PATCH("/:id/read", s.markRead)
		wh.DELETE("/:id", s.deleteWebhook) // ?scope=all: retirarlo para todos (creador o admin)

		// Enviar una notificación propia, a grupos (boss/admin) o a usuarios (admin)
		api.POST("/notifications", s.sendNotification)

		// Calendario del usuario (admin: ?scope=all para ver todos)
		cal := api.Group("/calendar")
		cal.GET("", s.listCalendar)
		cal.POST("", s.createCalendar)
		cal.PUT("/:id", s.updateCalendar)
		cal.DELETE("/:id", s.deleteCalendar)
		cal.POST("/delete", s.deleteCalendarBatch) // borrado en lote: {"ids": [...]}

		// Ajustes del usuario
		api.GET("/settings", s.getSettings)
		api.PUT("/settings", s.updateSettings)
		api.PATCH("/settings", s.updateSettings)
		api.POST("/settings/webhook-secret", s.rotateWebhookSecret)

		// Grupos: todos ven los suyos; boss y admin los crean y gestionan
		gr := api.Group("/groups")
		gr.GET("", s.listGroups)
		gr.POST("", s.requireGroupManager, s.createGroup)
		gr.GET("/:id", s.getGroup)
		gr.PATCH("/:id", s.updateGroup)
		gr.DELETE("/:id", s.deleteGroup)
		gr.POST("/:id/members", s.addGroupMembers)
		gr.DELETE("/:id/members/:userId", s.removeGroupMember)

		// Usuarios: boss/admin buscan (para añadir a grupos); solo el admin cambia roles
		api.GET("/users", s.requireGroupManager, s.listUsers)
		api.PATCH("/users/:id", s.requireAdmin, s.updateUser)
	}

	r.NoRoute(func(c *gin.Context) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Endpoint no encontrado. Usa POST /webhook"})
	})
	return r
}

func (s *Server) health(c *gin.Context) {
	status := "online"
	if err := s.store.Ping(c.Request.Context()); err != nil {
		status = "degraded"
	}
	c.JSON(http.StatusOK, gin.H{
		"status":  status,
		"server":  "Noticket Go Backend (Gin)",
		"time":    time.Now().UTC().Format(time.RFC3339),
		"clients": s.hub.Count(),
	})
}

// ---------- helpers ----------

func (s *Server) cors() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		allowed := ""
		for _, o := range s.corsOrigins {
			o = strings.TrimSpace(o)
			if o == "*" {
				allowed = "*"
				break
			}
			if o == origin {
				allowed = origin
				c.Header("Vary", "Origin")
				break
			}
		}
		if allowed != "" {
			c.Header("Access-Control-Allow-Origin", allowed)
			c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-webhook-secret")
		}
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func writeError(c *gin.Context, status int, msg string) {
	c.AbortWithStatusJSON(status, gin.H{"status": "error", "message": msg})
}

// currentUser es el usuario de la sesión (lo fija requireAuth).
func currentUser(c *gin.Context) models.User {
	return c.MustGet(ctxUser).(models.User)
}

// scopeAll: el admin puede pedir ?scope=all para ver los datos de todos los usuarios.
func scopeAll(c *gin.Context) bool {
	return c.Query("scope") == "all" && currentUser(c).IsAdmin()
}

func (s *Server) requireAdmin(c *gin.Context) {
	if !currentUser(c).IsAdmin() {
		writeError(c, http.StatusForbidden, "Solo un administrador puede hacer esto")
		return
	}
	c.Next()
}

func (s *Server) requireGroupManager(c *gin.Context) {
	if !currentUser(c).CanManageGroups() {
		writeError(c, http.StatusForbidden, "Solo un boss o un administrador puede gestionar grupos")
		return
	}
	c.Next()
}

// writeStoreError traduce errores de la capa de datos a respuestas HTTP.
func writeStoreError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeError(c, http.StatusNotFound, "Recurso no encontrado")
		return
	case errors.Is(err, store.ErrForbidden):
		writeError(c, http.StatusForbidden, "No tienes permiso sobre este recurso")
		return
	case errors.Is(err, store.ErrConflict):
		writeError(c, http.StatusConflict, "El recurso ya existe")
		return
	}
	log.Printf("error de base de datos: %v", err)
	writeError(c, http.StatusInternalServerError, "Error interno del servidor")
}
