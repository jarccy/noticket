package sse

import (
	"encoding/json"
	"sync"
)

// Hub reparte mensajes a los clientes SSE conectados, cada uno asociado a su usuario.
type Hub struct {
	mu      sync.Mutex
	clients map[chan []byte]string // canal → id de usuario
}

func NewHub() *Hub { return &Hub{clients: map[chan []byte]string{}} }

func (h *Hub) Subscribe(userID string) chan []byte {
	ch := make(chan []byte, 16)
	h.mu.Lock()
	h.clients[ch] = userID
	h.mu.Unlock()
	return ch
}

func (h *Hub) Unsubscribe(ch chan []byte) {
	h.mu.Lock()
	delete(h.clients, ch)
	h.mu.Unlock()
	close(ch)
}

func (h *Hub) Count() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.clients)
}

// SendTo serializa v a JSON y lo envía a todas las conexiones de esos usuarios;
// los clientes lentos pierden el mensaje.
func (h *Hub) SendTo(userIDs []string, v any) {
	if len(userIDs) == 0 {
		return
	}
	data, err := json.Marshal(v)
	if err != nil {
		return
	}
	targets := make(map[string]struct{}, len(userIDs))
	for _, id := range userIDs {
		targets[id] = struct{}{}
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch, userID := range h.clients {
		if _, ok := targets[userID]; !ok {
			continue
		}
		select {
		case ch <- data:
		default:
		}
	}
}
