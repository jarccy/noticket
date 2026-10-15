// Package auth reúne las piezas de autenticación sin estado de base de datos:
// hashing de contraseñas, tokens aleatorios, validaciones y límite de intentos.
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"net/mail"
	"strings"
	"sync"
	"time"
	"unicode"

	"golang.org/x/crypto/bcrypt"
)

const (
	bcryptCost       = 12
	PasswordMinLen   = 8
	passwordMaxBytes = 72 // límite de bcrypt
)

// NewToken genera 256 bits aleatorios en base64url (para sesiones, enlaces y OAuth).
func NewToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err) // crypto/rand no falla en sistemas soportados
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

// HashToken es lo que se guarda en la base: SHA-256 del token en base64url.
func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func HashPassword(password string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	return string(h), err
}

var (
	dummyOnce sync.Once
	dummyHash []byte
)

// CheckPassword compara en tiempo similar exista o no el usuario (hash == "" usa un hash de relleno),
// para no revelar por el tiempo de respuesta qué correos están registrados.
func CheckPassword(hash, password string) bool {
	if hash == "" {
		dummyOnce.Do(func() { dummyHash, _ = bcrypt.GenerateFromPassword([]byte("noticket-dummy"), bcryptCost) })
		bcrypt.CompareHashAndPassword(dummyHash, []byte(password))
		return false
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// PasswordProblem devuelve el motivo por el que la contraseña no es válida, o "" si lo es.
func PasswordProblem(p string) string {
	if len([]rune(p)) < PasswordMinLen {
		return "La contraseña debe tener al menos 8 caracteres"
	}
	if len(p) > passwordMaxBytes {
		return "La contraseña no puede superar 72 caracteres"
	}
	var letter, digit bool
	for _, r := range p {
		letter = letter || unicode.IsLetter(r)
		digit = digit || unicode.IsDigit(r)
	}
	if !letter || !digit {
		return "La contraseña debe incluir letras y números"
	}
	return ""
}

func NormalizeEmail(email string) string { return strings.ToLower(strings.TrimSpace(email)) }

func ValidEmail(email string) bool {
	if len(email) > 254 || !strings.Contains(email, "@") {
		return false
	}
	addr, err := mail.ParseAddress(email)
	return err == nil && addr.Address == email
}

// RateLimiter es una ventana fija en memoria. Suficiente para una sola instancia del backend.
type RateLimiter struct {
	mu      sync.Mutex
	buckets map[string]*bucket
}

type bucket struct {
	count   int
	resetAt time.Time
}

func NewRateLimiter() *RateLimiter { return &RateLimiter{buckets: map[string]*bucket{}} }

// Allow devuelve false si key ya superó max peticiones dentro de window.
func (l *RateLimiter) Allow(key string, max int, window time.Duration) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	b, ok := l.buckets[key]
	if !ok || now.After(b.resetAt) {
		if len(l.buckets) > 10_000 {
			for k, v := range l.buckets {
				if now.After(v.resetAt) {
					delete(l.buckets, k)
				}
			}
		}
		l.buckets[key] = &bucket{count: 1, resetAt: now.Add(window)}
		return true
	}
	b.count++
	return b.count <= max
}
