import type { Plugin } from 'vite'
import http from 'http'

interface WebhookEventData {
  id: string
  title: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error' | 'calendar'
  source: string
  timestamp: string
  date?: string
  time?: string
  category?: string
  rawPayload: Record<string, unknown>
}

// Global SSE clients list
const sseClients: http.ServerResponse[] = []
const eventHistory: WebhookEventData[] = []

export function broadcastWebhook(event: WebhookEventData) {
  eventHistory.unshift(event)
  if (eventHistory.length > 200) eventHistory.pop()

  const dataString = `data: ${JSON.stringify(event)}\n\n`
  sseClients.forEach((client) => {
    try {
      client.write(dataString)
    } catch {
      // client disconnected
    }
  })
}

function parseWebhookPayload(raw: Record<string, unknown>): WebhookEventData {
  const id = 'wh_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7)
  const timestamp = new Date().toISOString()

  // Flexible extraction from various webhook formats
  const title =
    (typeof raw.title === 'string' && raw.title) ||
    (typeof raw.subject === 'string' && raw.subject) ||
    (typeof raw.event === 'string' && raw.event) ||
    (typeof raw.action === 'string' && `Evento: ${raw.action}`) ||
    'Notificación de Webhook'

  const message =
    (typeof raw.message === 'string' && raw.message) ||
    (typeof raw.description === 'string' && raw.description) ||
    (typeof raw.text === 'string' && raw.text) ||
    (typeof raw.content === 'string' && raw.content) ||
    (typeof raw.details === 'string' && raw.details) ||
    (typeof raw.summary === 'string' && raw.summary) ||
    JSON.stringify(raw)

  let type: 'info' | 'success' | 'warning' | 'error' | 'calendar' = 'info'
  const rawType = String(raw.type || raw.level || raw.status || raw.severity || '').toLowerCase()

  if (rawType.includes('succ') || rawType.includes('ok') || rawType.includes('pass')) {
    type = 'success'
  } else if (rawType.includes('warn') || rawType.includes('alert')) {
    type = 'warning'
  } else if (rawType.includes('err') || rawType.includes('fail') || rawType.includes('crit')) {
    type = 'error'
  } else if (rawType.includes('cal') || rawType.includes('meet') || rawType.includes('event') || raw.date) {
    type = 'calendar'
  }

  const source =
    (typeof raw.source === 'string' && raw.source) ||
    (typeof raw.sender === 'string' && raw.sender) ||
    (typeof raw.app === 'string' && raw.app) ||
    'Webhook API'

  const date = typeof raw.date === 'string' ? raw.date : undefined
  const time = typeof raw.time === 'string' ? raw.time : undefined
  const category = typeof raw.category === 'string' ? raw.category : undefined

  return {
    id,
    title,
    message,
    type,
    source,
    timestamp,
    date,
    time,
    category,
    rawPayload: raw,
  }
}

export function webhookServerPlugin(): Plugin {
  return {
    name: 'vite-webhook-server',
    configureServer(server) {
      // 1. Setup middleware on Vite Dev Server (port 5173)
      server.middlewares.use((req, res, next) => {
        // Handle CORS
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-webhook-secret')

        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.end()
          return
        }

        const url = req.url?.split('?')[0] || ''

        // SSE Endpoint
        if (url === '/api/events' && req.method === 'GET') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          })
          res.write(`data: ${JSON.stringify({ type: 'connected', history: eventHistory })}\n\n`)
          sseClients.push(res)

          req.on('close', () => {
            const index = sseClients.indexOf(res)
            if (index !== -1) sseClients.splice(index, 1)
          })
          return
        }

        // Webhook Receiver Endpoint
        if ((url === '/api/webhook' || url === '/webhook') && req.method === 'POST') {
          let body = ''
          req.on('data', (chunk) => {
            body += chunk
          })
          req.on('end', () => {
            try {
              const parsed = body ? JSON.parse(body) : {}
              const event = parseWebhookPayload(parsed)
              broadcastWebhook(event)

              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(
                JSON.stringify({
                  status: 'success',
                  message: 'Webhook recibido y procesado',
                  event: {
                    id: event.id,
                    title: event.title,
                    type: event.type,
                    timestamp: event.timestamp,
                  },
                })
              )
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(
                JSON.stringify({
                  status: 'error',
                  message: 'JSON inválido o malformado',
                  error: String(err),
                })
              )
            }
          })
          return
        }

        // Health endpoint
        if (url === '/api/health' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              status: 'online',
              server: 'PulseDesk Webhook Engine',
              time: new Date().toISOString(),
              clients: sseClients.length,
              historyCount: eventHistory.length,
            })
          )
          return
        }

        next()
      })

      // 2. Also start dedicated Webhook HTTP server on port 3690 for external webhooks.
      //    Under `tauri dev` the Rust side owns 3690 (src-tauri/src/webhook.rs).
      if (process.env.TAURI_ENV_PLATFORM) return
      try {
        const dedicatedServer = http.createServer((req, res) => {
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-webhook-secret')

          if (req.method === 'OPTIONS') {
            res.statusCode = 204
            res.end()
            return
          }

          const url = req.url?.split('?')[0] || ''

          if ((url === '/webhook' || url === '/api/webhook') && req.method === 'POST') {
            let body = ''
            req.on('data', (chunk) => {
              body += chunk
            })
            req.on('end', () => {
              try {
                const parsed = body ? JSON.parse(body) : {}
                const event = parseWebhookPayload(parsed)
                broadcastWebhook(event)

                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(
                  JSON.stringify({
                    status: 'success',
                    message: 'Webhook recibido por servidor dedicado (3690)',
                    id: event.id,
                  })
                )
              } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                res.end(
                  JSON.stringify({
                    status: 'error',
                    message: 'JSON inválido',
                    error: String(err),
                  })
                )
              }
            })
            return
          }

          if (url === '/health' || url === '/api/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ status: 'ok', port: 3690 }))
            return
          }

          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Endpoint no encontrado. Usa POST /webhook' }))
        })

        dedicatedServer.listen(3690, '0.0.0.0', () => {
          console.log('\n  ⚡ Servidor dedicado de Webhooks activo en http://localhost:3690/webhook\n')
        })

        server.httpServer?.on('close', () => {
          dedicatedServer.close()
        })
      } catch (err) {
        console.warn('Dedicated port 3690 could not be bound:', err)
      }
    },
  }
}
