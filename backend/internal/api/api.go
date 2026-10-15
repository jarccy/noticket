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

	// Recepción de webhooks externos (pública; la protege el secreto de Configuración)
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

		// Webhooks guardados
		wh := api.Group("/webhooks")
		wh.GET("", s.listWebhooks)
		wh.POST("", s.saveWebhook) // la app guarda eventos que recibió por Tauri/Vite
		wh.DELETE("", s.clearWebhooks)
		wh.POST("/read-all", s.markAllRead)
		wh.GET("/:id", s.getWebhook)
		wh.PATCH("/:id/read", s.markRead)
		wh.DELETE("/:id", s.deleteWebhook)

		// Calendario
		cal := api.Group("/calendar")
		cal.GET("", s.listCalendar)
		cal.POST("", s.createCalendar)
		cal.PUT("/:id", s.updateCalendar)
		cal.DELETE("/:id", s.deleteCalendar)

		// Ajustes
		api.GET("/settings", s.getSettings)
		api.PUT("/settings", s.updateSettings)
		api.PATCH("/settings", s.updateSettings)
	}

	r.NoRoute(func(c *gin.Context) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Endpoint no encontrado. Usa POST /webhook"})
	})
	return r
}

func (s *Server) health(c *gin.Context) {
	unread, err := s.store.UnreadCount(c.Request.Context())
	status := "online"
	if err != nil {
		status = "degraded"
	}
	c.JSON(http.StatusOK, gin.H{
		"status":  status,
		"server":  "Noticket Go Backend (Gin)",
		"time":    time.Now().UTC().Format(time.RFC3339),
		"clients": s.hub.Count(),
		"unread":  unread,
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

// writeStoreError traduce errores de la capa de datos a respuestas HTTP.
func writeStoreError(c *gin.Context, err error) {
	if errors.Is(err, store.ErrNotFound) {
		writeError(c, http.StatusNotFound, "Recurso no encontrado")
		return
	}
	log.Printf("error de base de datos: %v", err)
	writeError(c, http.StatusInternalServerError, "Error interno del servidor")
}
