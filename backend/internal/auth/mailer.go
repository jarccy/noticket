package auth

import (
	"fmt"
	"html"
	"log"
	"mime"
	"net"
	"net/smtp"
	"strings"
	"time"

	"notiback/internal/config"
)

type Mailer struct {
	cfg config.SMTPConfig
}

func NewMailer(cfg config.SMTPConfig) *Mailer { return &Mailer{cfg: cfg} }

// SendPasswordReset envía el enlace de restablecimiento. Sin SMTP configurado
// (desarrollo) lo escribe en el log del servidor.
func (m *Mailer) SendPasswordReset(to, name, link string, ttl time.Duration) error {
	if !m.cfg.Enabled() {
		log.Printf("[mail] SMTP no configurado. Enlace para restablecer la contraseña de %s:\n  %s", to, link)
		return nil
	}

	greeting := "Hola,"
	if name != "" {
		greeting = "Hola " + name + ","
	}
	minutes := int(ttl.Minutes())
	text := fmt.Sprintf("%s\n\nPara elegir una nueva contraseña abre este enlace (caduca en %d minutos):\n%s\n\nSi no lo pediste, ignora este correo.\n",
		greeting, minutes, link)
	htmlBody := fmt.Sprintf(`<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;color:#18181b">
<p>%s</p>
<p>Para elegir una nueva contraseña pulsa el botón. El enlace caduca en %d minutos.</p>
<p style="margin:28px 0"><a href="%s" style="background:#18181b;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Restablecer contraseña</a></p>
<p style="font-size:13px;color:#71717a">Si no lo pediste, ignora este correo. Tu contraseña no cambiará.</p>
</div>`, html.EscapeString(greeting), minutes, html.EscapeString(link))

	const boundary = "noticket-boundary"
	var msg strings.Builder
	fmt.Fprintf(&msg, "From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\n", m.cfg.From, to,
		mime.QEncoding.Encode("utf-8", "Restablece tu contraseña de Noticket"))
	fmt.Fprintf(&msg, "Content-Type: multipart/alternative; boundary=%s\r\n\r\n", boundary)
	fmt.Fprintf(&msg, "--%s\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n%s\r\n", boundary, text)
	fmt.Fprintf(&msg, "--%s\r\nContent-Type: text/html; charset=utf-8\r\n\r\n%s\r\n--%s--\r\n", boundary, htmlBody, boundary)

	var a smtp.Auth
	if m.cfg.User != "" {
		a = smtp.PlainAuth("", m.cfg.User, m.cfg.Password, m.cfg.Host)
	}
	// smtp.SendMail usa STARTTLS automáticamente si el servidor lo ofrece (puerto 587)
	return smtp.SendMail(net.JoinHostPort(m.cfg.Host, m.cfg.Port), a, addrOnly(m.cfg.From), []string{to}, []byte(msg.String()))
}

// addrOnly extrae el correo de "Nombre <correo>" para el sobre SMTP.
func addrOnly(from string) string {
	if i, j := strings.LastIndex(from, "<"), strings.LastIndex(from, ">"); i >= 0 && j > i {
		return from[i+1 : j]
	}
	return from
}
