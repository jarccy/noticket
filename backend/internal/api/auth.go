package api

import (
	"errors"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"notiback/internal/auth"
	"notiback/internal/models"
	"notiback/internal/store"
)

const (
	sessionTTL         = 24 * time.Hour
	sessionTTLRemember = 30 * 24 * time.Hour
	resetTTL           = time.Hour
	oauthStateTTL      = 10 * time.Minute
	loginCodeTTL       = 2 * time.Minute

	ctxUser = "user"
)

type sessionResponse struct {
	Token     string            `json:"token"`
	ExpiresAt time.Time         `json:"expiresAt"`
	User      models.PublicUser `json:"user"`
}

// issueSession crea la sesión en Postgres y responde con el token (en claro, solo esta vez).
func (s *Server) issueSession(c *gin.Context, status int, u models.User, remember bool) {
	ttl := sessionTTL
	if remember {
		ttl = sessionTTLRemember
	}
	token := auth.NewToken()
	expires := time.Now().Add(ttl).UTC()
	if err := s.store.CreateSession(c.Request.Context(), auth.HashToken(token), u.ID, expires); err != nil {
		writeStoreError(c, err)
		return
	}
	c.JSON(status, sessionResponse{Token: token, ExpiresAt: expires, User: u.Public()})
}

// requireAuth valida el token `Authorization: Bearer …`. Solo el stream SSE acepta además
// `?access_token=` porque EventSource no permite cabeceras.
func (s *Server) requireAuth(c *gin.Context) {
	token := bearerToken(c)
	if token == "" && c.FullPath() == "/api/events" {
		token = c.Query("access_token")
	}
	if token == "" {
		writeError(c, http.StatusUnauthorized, "No autenticado")
		return
	}
	u, err := s.store.UserBySession(c.Request.Context(), auth.HashToken(token))
	if errors.Is(err, store.ErrNotFound) {
		writeError(c, http.StatusUnauthorized, "Sesión inválida o caducada")
		return
	}
	if err != nil {
		writeStoreError(c, err)
		return
	}
	c.Set(ctxUser, u)
	c.Next()
}

// applyAdminEmail da el rol admin a una cuenta nueva si su correo está en ADMIN_EMAILS.
func (s *Server) applyAdminEmail(c *gin.Context, u models.User) (models.User, error) {
	if u.IsAdmin() || !s.cfg.IsAdminEmail(u.Email) {
		return u, nil
	}
	return s.store.SetUserType(c.Request.Context(), u.ID, models.UserAdmin)
}

func bearerToken(c *gin.Context) string {
	if h := c.GetHeader("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return strings.TrimSpace(h[len("Bearer "):])
	}
	return ""
}

// allowedRedirect devuelve origin si es un frontend permitido; si no, FRONTEND_URL.
func (s *Server) allowedRedirect(origin string) string {
	origin = strings.TrimRight(origin, "/")
	if u, err := url.Parse(origin); err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != "" && u.Path == "" {
		if origin == s.cfg.FrontendURL {
			return origin
		}
		for _, o := range s.cfg.CORSOrigins {
			if o != "*" && o == origin {
				return origin
			}
		}
	}
	return s.cfg.FrontendURL
}

func (s *Server) limited(c *gin.Context, key string, max int, window time.Duration) bool {
	if s.limiter.Allow(key, max, window) {
		return false
	}
	writeError(c, http.StatusTooManyRequests, "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.")
	return true
}

// ---------- Correo y contraseña ----------

func (s *Server) register(c *gin.Context) {
	if s.limited(c, "register:"+c.ClientIP(), 10, time.Hour) {
		return
	}
	var body struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
		Remember bool   `json:"remember"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		writeError(c, http.StatusBadRequest, "JSON inválido")
		return
	}
	email := auth.NormalizeEmail(body.Email)
	if !auth.ValidEmail(email) {
		writeError(c, http.StatusBadRequest, "Introduce un correo válido")
		return
	}
	if p := auth.PasswordProblem(body.Password); p != "" {
		writeError(c, http.StatusBadRequest, p)
		return
	}
	name := strings.TrimSpace(body.Name)
	if len([]rune(name)) > 100 {
		name = string([]rune(name)[:100])
	}

	hash, err := auth.HashPassword(body.Password)
	if err != nil {
		writeStoreError(c, err)
		return
	}
	u, err := s.store.CreatePasswordUser(c.Request.Context(), email, name, hash)
	if errors.Is(err, store.ErrEmailTaken) {
		writeError(c, http.StatusConflict, "Ya existe una cuenta con ese correo")
		return
	}
	if err != nil {
		writeStoreError(c, err)
		return
	}
	if u, err = s.applyAdminEmail(c, u); err != nil {
		writeStoreError(c, err)
		return
	}
	s.issueSession(c, http.StatusCreated, u, body.Remember)
}

func (s *Server) login(c *gin.Context) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Remember bool   `json:"remember"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Email == "" || body.Password == "" {
		writeError(c, http.StatusBadRequest, "Correo y contraseña son obligatorios")
		return
	}
	email := auth.NormalizeEmail(body.Email)
	// Límite por IP y por cuenta para frenar fuerza bruta
	if s.limited(c, "login:ip:"+c.ClientIP(), 20, 15*time.Minute) || s.limited(c, "login:email:"+email, 8, 15*time.Minute) {
		return
	}

	u, err := s.store.UserByEmail(c.Request.Context(), email)
	if err != nil && !errors.Is(err, store.ErrNotFound) {
		writeStoreError(c, err)
		return
	}
	hash := ""
	if err == nil && u.PasswordHash != nil {
		hash = *u.PasswordHash
	}
	// Mismo mensaje si no existe, si la clave falla o si la cuenta solo usa Google (no revela qué correos existen)
	if !auth.CheckPassword(hash, body.Password) {
		writeError(c, http.StatusUnauthorized, "Correo o contraseña incorrectos")
		return
	}
	s.issueSession(c, http.StatusOK, u, body.Remember)
}

func (s *Server) logout(c *gin.Context) {
	if err := s.store.DeleteSession(c.Request.Context(), auth.HashToken(bearerToken(c))); err != nil {
		writeStoreError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (s *Server) me(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"user": currentUser(c).Public()})
}

func (s *Server) providers(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"google": s.google.Enabled()})
}

// ---------- Restablecer contraseña ----------

func (s *Server) forgotPassword(c *gin.Context) {
	var body struct {
		Email      string `json:"email"`
		RedirectTo string `json:"redirectTo"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		writeError(c, http.StatusBadRequest, "JSON inválido")
		return
	}
	email := auth.NormalizeEmail(body.Email)
	if !auth.ValidEmail(email) {
		writeError(c, http.StatusBadRequest, "Introduce un correo válido")
		return
	}
	if s.limited(c, "forgot:ip:"+c.ClientIP(), 10, 15*time.Minute) || s.limited(c, "forgot:email:"+email, 3, 15*time.Minute) {
		return
	}

	ctx := c.Request.Context()
	u, err := s.store.UserByEmail(ctx, email)
	switch {
	case errors.Is(err, store.ErrNotFound):
		// No se revela si el correo existe
	case err != nil:
		writeStoreError(c, err)
		return
	default:
		token := auth.NewToken()
		if err := s.store.CreateResetToken(ctx, auth.HashToken(token), u.ID, time.Now().Add(resetTTL)); err != nil {
			writeStoreError(c, err)
			return
		}
		link := s.allowedRedirect(body.RedirectTo) + "/reset-password?token=" + url.QueryEscape(token)
		if err := s.mailer.SendPasswordReset(u.Email, u.Name, link, resetTTL); err != nil {
			log.Printf("[mail] no se pudo enviar el correo de restablecimiento: %v", err)
			writeError(c, http.StatusBadGateway, "No se pudo enviar el correo. Inténtalo de nuevo más tarde.")
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"message": "Si existe una cuenta con ese correo, te enviamos un enlace para restablecer la contraseña.",
	})
}

// validateResetToken va por POST para que el token no quede en los logs de acceso.
func (s *Server) validateResetToken(c *gin.Context) {
	var body struct {
		Token string `json:"token"`
	}
	_ = c.ShouldBindJSON(&body)
	valid := false
	if body.Token != "" {
		var err error
		if valid, err = s.store.ResetTokenValid(c.Request.Context(), auth.HashToken(body.Token)); err != nil {
			writeStoreError(c, err)
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"valid": valid})
}

func (s *Server) resetPassword(c *gin.Context) {
	if s.limited(c, "reset:ip:"+c.ClientIP(), 10, 15*time.Minute) {
		return
	}
	var body struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Token == "" {
		writeError(c, http.StatusBadRequest, "El enlace no es válido o ha caducado. Solicita uno nuevo.")
		return
	}
	if p := auth.PasswordProblem(body.Password); p != "" {
		writeError(c, http.StatusBadRequest, p)
		return
	}
	hash, err := auth.HashPassword(body.Password)
	if err != nil {
		writeStoreError(c, err)
		return
	}
	err = s.store.ResetPassword(c.Request.Context(), auth.HashToken(body.Token), hash)
	if errors.Is(err, store.ErrNotFound) {
		writeError(c, http.StatusBadRequest, "El enlace no es válido o ha caducado. Solicita uno nuevo.")
		return
	}
	if err != nil {
		writeStoreError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Contraseña actualizada. Ya puedes iniciar sesión."})
}

// ---------- Google OAuth ----------

// googleStart: GET /api/auth/google?redirect_to=<origen del frontend>
func (s *Server) googleStart(c *gin.Context) {
	redirectTo := s.allowedRedirect(c.Query("redirect_to"))
	if !s.google.Enabled() {
		c.Redirect(http.StatusFound, redirectTo+"/?auth_error=google_not_configured")
		return
	}
	state, verifier := auth.NewToken(), auth.NewToken()
	if err := s.store.SaveOAuthState(c.Request.Context(), auth.HashToken(state), verifier, redirectTo, time.Now().Add(oauthStateTTL)); err != nil {
		writeStoreError(c, err)
		return
	}
	c.Redirect(http.StatusFound, s.google.AuthURL(state, verifier))
}

// googleCallback: Google vuelve aquí; se crea/vincula el usuario y se redirige al frontend
// con un código de un solo uso (?google_code=) que el frontend canjea por la sesión.
func (s *Server) googleCallback(c *gin.Context) {
	ctx := c.Request.Context()
	verifier, redirectTo, err := s.store.TakeOAuthState(ctx, auth.HashToken(c.Query("state")))
	if err != nil {
		if !errors.Is(err, store.ErrNotFound) {
			log.Printf("[auth] oauth state: %v", err)
		}
		c.Redirect(http.StatusFound, s.cfg.FrontendURL+"/?auth_error=google_state")
		return
	}
	fail := func(code string) { c.Redirect(http.StatusFound, redirectTo+"/?auth_error="+code) }

	if c.Query("error") != "" || c.Query("code") == "" {
		fail("google_cancelled")
		return
	}
	id, err := s.google.Exchange(ctx, c.Query("code"), verifier)
	if err != nil {
		log.Printf("[auth] login con Google falló: %v", err)
		fail("google")
		return
	}
	if !id.EmailVerified {
		fail("google_unverified")
		return
	}
	u, err := s.store.UpsertGoogleUser(ctx, id.Sub, auth.NormalizeEmail(id.Email), id.Name, id.Picture)
	if err == nil {
		u, err = s.applyAdminEmail(c, u)
	}
	if err != nil {
		log.Printf("[auth] guardando usuario de Google: %v", err)
		fail("google")
		return
	}
	code := auth.NewToken()
	if err := s.store.SaveLoginCode(ctx, auth.HashToken(code), u.ID, time.Now().Add(loginCodeTTL)); err != nil {
		log.Printf("[auth] login code: %v", err)
		fail("google")
		return
	}
	c.Redirect(http.StatusFound, redirectTo+"/?google_code="+url.QueryEscape(code))
}

// googleExchange: POST /api/auth/google/exchange {code, remember} → sesión
func (s *Server) googleExchange(c *gin.Context) {
	if s.limited(c, "gexchange:"+c.ClientIP(), 20, 15*time.Minute) {
		return
	}
	var body struct {
		Code     string `json:"code"`
		Remember bool   `json:"remember"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Code == "" {
		writeError(c, http.StatusBadRequest, "Código inválido")
		return
	}
	ctx := c.Request.Context()
	userID, err := s.store.TakeLoginCode(ctx, auth.HashToken(body.Code))
	if errors.Is(err, store.ErrNotFound) {
		writeError(c, http.StatusUnauthorized, "El inicio de sesión con Google caducó. Inténtalo de nuevo.")
		return
	}
	if err != nil {
		writeStoreError(c, err)
		return
	}
	token := auth.NewToken()
	ttl := sessionTTL
	if body.Remember {
		ttl = sessionTTLRemember
	}
	expires := time.Now().Add(ttl).UTC()
	if err := s.store.CreateSession(ctx, auth.HashToken(token), userID, expires); err != nil {
		writeStoreError(c, err)
		return
	}
	u, err := s.store.UserBySession(ctx, auth.HashToken(token))
	if err != nil {
		writeStoreError(c, err)
		return
	}
	c.JSON(http.StatusOK, sessionResponse{Token: token, ExpiresAt: expires, User: u.Public()})
}
