package config

import (
	"bufio"
	"os"
	"strings"
)

type Config struct {
	DatabaseURL string
	Port        string
	CORSOrigins []string

	// URL pública de este backend (para el callback de Google) y del frontend (enlaces de correo)
	PublicURL   string
	FrontendURL string

	GoogleClientID     string
	GoogleClientSecret string

	SMTP SMTPConfig
}

type SMTPConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	From     string
}

func (s SMTPConfig) Enabled() bool { return s.Host != "" }

// Load lee las variables de entorno (y un archivo .env opcional).
func Load() Config {
	loadDotEnv(".env")
	port := getenv("PORT", "8080")
	frontend := strings.TrimRight(getenv("FRONTEND_URL", "http://localhost:5173"), "/")

	var origins []string
	for _, o := range strings.Split(getenv("CORS_ORIGINS", frontend), ",") {
		if o = strings.TrimSpace(o); o != "" {
			origins = append(origins, strings.TrimRight(o, "/"))
		}
	}

	return Config{
		DatabaseURL:        getenv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/dbnoticket?sslmode=disable"),
		Port:               port,
		CORSOrigins:        origins,
		PublicURL:          strings.TrimRight(getenv("PUBLIC_URL", "http://localhost:"+port), "/"),
		FrontendURL:        frontend,
		GoogleClientID:     getenv("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret: getenv("GOOGLE_CLIENT_SECRET", ""),
		SMTP: SMTPConfig{
			Host:     getenv("SMTP_HOST", ""),
			Port:     getenv("SMTP_PORT", "587"),
			User:     getenv("SMTP_USER", ""),
			Password: getenv("SMTP_PASSWORD", ""),
			From:     getenv("SMTP_FROM", getenv("SMTP_USER", "")),
		},
	}
}

func getenv(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

// loadDotEnv carga KEY=VALUE sin sobrescribir variables ya definidas.
func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		k = strings.TrimSpace(k)
		v = strings.Trim(strings.TrimSpace(v), `"'`)
		if _, exists := os.LookupEnv(k); !exists {
			os.Setenv(k, v)
		}
	}
}
