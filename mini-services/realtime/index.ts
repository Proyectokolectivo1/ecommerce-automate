// ============================================================
// realtime/index.ts — Socket.io mini-service (port 3003)
// ============================================================
// Servicio de tiempo real para notificaciones del dashboard:
//   - Nuevos pedidos importados desde Shopify.
//   - Cambios de estado de pedidos.
//   - Confirmaciones de pago de transporte (COD).
//   - Actualizaciones de tracking de guías.
//   - Alertas operativas.
//
// El frontend se conecta con: io('/?XTransformPort=3003')
// (Caddy reenvía al puerto 3003 gracias al query param).
//
// Eventos salientes (server → client):
//   - 'order:created'      { orderId, orderNumber, status }
//   - 'order:transition'   { orderId, orderNumber, from, to, actor }
//   - 'payment:confirmed'  { orderId, provider, amount, status }
//   - 'guide:status'       { shipmentId, guideNumber, status }
//   - 'alert:new'          { alertId, type, severity, message }
//
// El servicio también expone endpoints HTTP (POST /emit, GET /health)
// para que la API de Next.js pueda emitir eventos (bridge HTTP→WS).
// IMPORTANTE: como socket.io usa path '/', intercepta todos los
// requests HTTP. Reordenamos los listeners para que nuestras rutas
// custom se procesen ANTES que engine.io.

import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { Server } from 'socket.io'

const httpServer = createServer()
const io = new Server(httpServer, {
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// --- Reordenar listeners: nuestras rutas HTTP van PRIMERO ----------
// socket.io (engine.io) registra su listener en httpServer. Con
// path: '/' intercepta todo. Removemos los listeners existentes,
// ponemos el nuestro, y en caso de no match, delegamos a engine.io.
const engineListeners = httpServer.listeners('request').slice(0)
httpServer.removeAllListeners('request')

const SECRET = process.env.REALTIME_SECRET || 'dev-realtime-secret'

httpServer.on('request', (req: IncomingMessage, res: ServerResponse) => {
  const url = req.url ?? '/'

  // Bridge HTTP→WS: POST /emit
  if (req.method === 'POST' && url === '/emit') {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      const auth = req.headers['x-realtime-secret']
      if (auth !== SECRET) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }))
        return
      }
      try {
        const payload = JSON.parse(body) as { event: string; data: Record<string, unknown> }
        io.emit(payload.event, payload.data)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, emitted: payload.event }))
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }))
      }
    })
    return
  }

  // Health check: GET /health
  if (req.method === 'GET' && url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      ok: true,
      uptime: Math.round(process.uptime()),
      connections: io.engine.clientsCount,
    }))
    return
  }

  // Todo lo demás: delegar a engine.io (socket.io)
  for (const listener of engineListeners) {
    listener.call(httpServer, req, res)
  }
})

io.on('connection', (socket) => {
  console.log(`[realtime] client connected: ${socket.id}`)

  socket.on('subscribe', (channels: unknown) => {
    if (Array.isArray(channels)) {
      for (const ch of channels) {
        if (typeof ch === 'string') socket.join(`channel:${ch}`)
      }
    }
  })

  socket.on('ping', (cb: unknown) => {
    if (typeof cb === 'function') cb()
  })

  socket.on('disconnect', (reason) => {
    console.log(`[realtime] client disconnected: ${socket.id} (${reason})`)
  })
})

const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`[realtime] Socket.io service running on port ${PORT}`)
  console.log(`[realtime] Health: http://localhost:${PORT}/health`)
  console.log(`[realtime] Emit bridge: POST http://localhost:${PORT}/emit (x-realtime-secret header)`)
})

process.on('SIGTERM', () => {
  console.log('[realtime] SIGTERM received, shutting down...')
  io.close(() => httpServer.close(() => process.exit(0)))
})
process.on('SIGINT', () => {
  console.log('[realtime] SIGINT received, shutting down...')
  io.close(() => httpServer.close(() => process.exit(0)))
})
