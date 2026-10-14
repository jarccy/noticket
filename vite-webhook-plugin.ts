import type { Plugin } from 'vite'
import http from 'http'

/**
 * Under `pnpm dev` (browser) the Go backend (notiback) is the webhook engine: it parses,
 * persists in PostgreSQL and broadcasts via SSE. This plugin only forwards webhooks that
 * arrive at the Vite server (5173/api/webhook) or the dedicated port 3690 to it.
 */
const API_URL = process.env.VITE_API_URL || 'http://localhost:8080'

const FORWARDED_HEADERS = ['content-type', 'authorization', 'x-webhook-secret']

function setCors(res: http.ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-webhook-secret')
}

function sendJson(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

function forwardWebhook(req: http.IncomingMessage, res: http.ServerResponse) {
  let body = ''
  req.on('data', (chunk) => {
    body += chunk
  })
  req.on('end', async () => {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    for (const name of FORWARDED_HEADERS) {
      const value = req.headers[name]
      if (typeof value === 'string') headers[name] = value
    }
    try {
      const upstream = await fetch(API_URL + '/webhook', { method: 'POST', headers, body })
      res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json' })
      res.end(await upstream.text())
    } catch (err) {
      sendJson(res, 502, {
        status: 'error',
        message: `Backend no disponible en ${API_URL}. Arranca notiback (go run ./cmd/server).`,
        error: String(err),
      })
    }
  })
}

const isWebhookRoute = (url: string) => url === '/webhook' || url === '/api/webhook'

export function webhookServerPlugin(): Plugin {
  return {
    name: 'vite-webhook-server',
    configureServer(server) {
      // 1. Vite dev server (port 5173): /api/webhook → Go backend
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] || ''
        if (!isWebhookRoute(url)) return next()

        setCors(res)
        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.end()
          return
        }
        if (req.method === 'POST') return forwardWebhook(req, res)
        next()
      })

      // 2. Dedicated port 3690 for external webhooks → Go backend.
      //    Under `tauri dev` the Rust side owns 3690 (src-tauri/src/webhook.rs).
      if (process.env.TAURI_ENV_PLATFORM) return
      try {
        const dedicatedServer = http.createServer((req, res) => {
          setCors(res)
          if (req.method === 'OPTIONS') {
            res.statusCode = 204
            res.end()
            return
          }

          const url = req.url?.split('?')[0] || ''

          if (isWebhookRoute(url) && req.method === 'POST') {
            forwardWebhook(req, res)
            return
          }

          if (url === '/health' || url === '/api/health') {
            sendJson(res, 200, { status: 'ok', port: 3690, backend: API_URL })
            return
          }

          sendJson(res, 404, { error: 'Endpoint no encontrado. Usa POST /webhook' })
        })

        dedicatedServer.listen(3690, '0.0.0.0', () => {
          console.log(`\n  ⚡ Webhooks en http://localhost:3690/webhook → ${API_URL}/webhook\n`)
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
