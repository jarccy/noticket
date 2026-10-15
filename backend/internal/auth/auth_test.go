package auth

import (
	"testing"
	"time"
)

func TestPasswordProblem(t *testing.T) {
	cases := map[string]bool{ // contraseña → válida
		"":            false,
		"abc123":      false, // corta
		"abcdefgh":    false, // sin números
		"12345678":    false, // sin letras
		"secreto123":  true,
		"contraseña1": true,
	}
	for p, valid := range cases {
		if got := PasswordProblem(p) == ""; got != valid {
			t.Errorf("PasswordProblem(%q) válida=%v, se esperaba %v", p, got, valid)
		}
	}
}

func TestValidEmail(t *testing.T) {
	for e, want := range map[string]bool{
		"ana@example.com": true,
		"ana@example":     true,
		"ana":             false,
		"Ana <a@b.com>":   false,
		"":                false,
	} {
		if got := ValidEmail(e); got != want {
			t.Errorf("ValidEmail(%q) = %v, se esperaba %v", e, got, want)
		}
	}
}

func TestPasswordHashRoundTrip(t *testing.T) {
	h, err := HashPassword("secreto123")
	if err != nil {
		t.Fatal(err)
	}
	if !CheckPassword(h, "secreto123") || CheckPassword(h, "otra12345") {
		t.Fatal("CheckPassword no coincide con HashPassword")
	}
	if CheckPassword("", "secreto123") {
		t.Fatal("un hash vacío nunca debe validar")
	}
}

func TestTokens(t *testing.T) {
	a, b := NewToken(), NewToken()
	if a == b || len(a) != 43 {
		t.Fatalf("tokens inesperados: %q %q", a, b)
	}
	if HashToken(a) != HashToken(a) || HashToken(a) == a {
		t.Fatal("HashToken debe ser determinista y distinto del token")
	}
}

func TestRateLimiter(t *testing.T) {
	l := NewRateLimiter()
	for i := 0; i < 3; i++ {
		if !l.Allow("k", 3, time.Minute) {
			t.Fatalf("petición %d debería pasar", i+1)
		}
	}
	if l.Allow("k", 3, time.Minute) {
		t.Fatal("la cuarta petición debería bloquearse")
	}
	if !l.Allow("otra", 3, time.Minute) {
		t.Fatal("otra clave no debe verse afectada")
	}
}
