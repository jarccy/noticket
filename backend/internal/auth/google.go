package auth

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	googleAuthURL  = "https://accounts.google.com/o/oauth2/v2/auth"
	googleTokenURL = "https://oauth2.googleapis.com/token"
)

type Google struct {
	ClientID     string
	ClientSecret string
	RedirectURI  string // {PUBLIC_URL}/api/auth/google/callback
	HTTP         *http.Client
}

func (g Google) Enabled() bool { return g.ClientID != "" && g.ClientSecret != "" }

// AuthURL construye la URL de consentimiento (Authorization Code + PKCE S256).
func (g Google) AuthURL(state, codeVerifier string) string {
	sum := sha256.Sum256([]byte(codeVerifier))
	q := url.Values{
		"client_id":             {g.ClientID},
		"redirect_uri":          {g.RedirectURI},
		"response_type":         {"code"},
		"scope":                 {"openid email profile"},
		"state":                 {state},
		"code_challenge":        {base64.RawURLEncoding.EncodeToString(sum[:])},
		"code_challenge_method": {"S256"},
		"prompt":                {"select_account"},
	}
	return googleAuthURL + "?" + q.Encode()
}

type GoogleIdentity struct {
	Sub           string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
}

// Exchange canjea el código por tokens y devuelve la identidad del id_token. El id_token llega
// directamente de Google por TLS (flujo de servidor), así que basta con validar iss/aud/exp.
func (g Google) Exchange(ctx context.Context, code, codeVerifier string) (GoogleIdentity, error) {
	var id GoogleIdentity
	form := url.Values{
		"code":          {code},
		"client_id":     {g.ClientID},
		"client_secret": {g.ClientSecret},
		"redirect_uri":  {g.RedirectURI},
		"grant_type":    {"authorization_code"},
		"code_verifier": {codeVerifier},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, googleTokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return id, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := g.HTTP
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	res, err := client.Do(req)
	if err != nil {
		return id, err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode != http.StatusOK {
		return id, fmt.Errorf("google token endpoint → %d: %s", res.StatusCode, body)
	}

	var tok struct {
		IDToken string `json:"id_token"`
	}
	if err := json.Unmarshal(body, &tok); err != nil || tok.IDToken == "" {
		return id, errors.New("google no devolvió id_token")
	}
	parts := strings.Split(tok.IDToken, ".")
	if len(parts) != 3 {
		return id, errors.New("id_token malformado")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return id, fmt.Errorf("id_token: %w", err)
	}

	var claims struct {
		GoogleIdentity
		EmailVerified any    `json:"email_verified"` // Google lo envía como bool (a veces como string)
		Iss           string `json:"iss"`
		Aud           string `json:"aud"`
		Exp           int64  `json:"exp"`
	}
	if err := json.Unmarshal(payload, &claims); err != nil {
		return id, fmt.Errorf("id_token: %w", err)
	}
	switch {
	case claims.Iss != "https://accounts.google.com" && claims.Iss != "accounts.google.com":
		return id, errors.New("id_token: iss inválido")
	case claims.Aud != g.ClientID:
		return id, errors.New("id_token: aud inválido")
	case time.Unix(claims.Exp, 0).Before(time.Now()):
		return id, errors.New("id_token caducado")
	case claims.Sub == "" || claims.Email == "":
		return id, errors.New("id_token sin sub/email")
	}
	id = claims.GoogleIdentity
	id.EmailVerified = claims.EmailVerified == true || claims.EmailVerified == "true"
	return id, nil
}
