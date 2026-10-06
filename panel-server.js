'use strict'
// Local web panel of the sparring bot: serves the built panel (panel/dist), streams the bot's live
// state over Server-Sent Events and takes commands over a small JSON API. Reachable on the local
// network for the phone, so every request needs the panel token. The login password never leaves.

const http = require('http')
const fs = require('fs')
const os = require('os')
const path = require('path')

const DIST = path.join(__dirname, 'panel', 'dist')
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json'
}
const STATE_INTERVAL_MS = 100

/** The first LAN IPv4 of this machine, for the phone link. */
function lanAddress () {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const entry of list || []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address
    }
  }
  return null
}

/**
 * @param controller {
 *   token, port,
 *   state(): object, logs(): string[], onLog(fn), onEvent(fn),
 *   command(text): void, connect(): void, disconnect(): void, reconnect(): void, skin(): Promise<Buffer|null>,
 *   config(): object (no password), saveConfig(patch): { restart: boolean }
 * }
 */
function startPanelServer (controller) {
  const clients = new Set()

  function send (res, event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  function broadcast (event, data) {
    for (const res of clients) send(res, event, data)
  }

  controller.onLog((line) => broadcast('log', line))
  controller.onEvent((event) => broadcast('combat', event))
  setInterval(() => {
    if (clients.size > 0) broadcast('state', controller.state())
  }, STATE_INTERVAL_MS)

  function authorized (req, url) {
    const token = req.headers['x-panel-token'] || url.searchParams.get('t')
    return token === controller.token
  }

  function json (res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(body))
  }

  function readBody (req) {
    return new Promise((resolve, reject) => {
      let raw = ''
      req.on('data', (chunk) => {
        raw += chunk
        if (raw.length > 64 * 1024) reject(new Error('demasiado grande'))
      })
      req.on('end', () => {
        try {
          resolve(raw ? JSON.parse(raw) : {})
        } catch (e) {
          reject(new Error('JSON inválido'))
        }
      })
      req.on('error', reject)
    })
  }

  function serveStatic (res, pathname) {
    const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1))
    const file = path.normalize(path.join(DIST, relative))
    if (!file.startsWith(DIST + path.sep)) return json(res, 403, { error: 'ruta no permitida' })
    fs.readFile(file, (err, data) => {
      if (err) {
        // Single page app: unknown paths get the panel
        fs.readFile(path.join(DIST, 'index.html'), (err2, index) => {
          if (err2) {
            res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('El panel no está compilado: ejecuta "npm run build" en tools/sparring-bot/panel.')
            return
          }
          res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' })
          res.end(index)
        })
        return
      }
      const cache = relative.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-store'
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': cache })
      res.end(data)
    })
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://panel.local')
    if (!url.pathname.startsWith('/api/')) return serveStatic(res, url.pathname)
    if (!authorized(req, url)) return json(res, 401, { error: 'Falta la clave del panel o no es correcta.' })

    try {
      if (req.method === 'GET' && url.pathname === '/api/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no'
        })
        res.write('retry: 2000\n\n')
        send(res, 'state', controller.state())
        send(res, 'history', controller.logs())
        clients.add(res)
        req.on('close', () => clients.delete(res))
        return
      }
      if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, controller.state())
      if (req.method === 'GET' && url.pathname === '/api/config') return json(res, 200, controller.config())
      if (req.method === 'GET' && url.pathname === '/api/skin') {
        let png = null
        try {
          png = await controller.skin()
        } catch (e) {
          return json(res, 502, { error: `No pude descargar la skin: ${e.message}` })
        }
        if (!png) return json(res, 404, { error: 'El bot no tiene skin en este servidor.' })
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' })
        res.end(png)
        return
      }
      if (req.method === 'POST' && url.pathname === '/api/command') {
        const body = await readBody(req)
        if (typeof body.text !== 'string' || !body.text.startsWith('!')) return json(res, 400, { error: 'Orden no válida.' })
        controller.command(body.text)
        return json(res, 200, { ok: true })
      }
      if (req.method === 'POST' && url.pathname === '/api/connect') {
        controller.connect()
        return json(res, 200, { ok: true })
      }
      if (req.method === 'POST' && url.pathname === '/api/reconnect') {
        controller.reconnect()
        return json(res, 200, { ok: true })
      }
      if (req.method === 'POST' && url.pathname === '/api/disconnect') {
        controller.disconnect()
        return json(res, 200, { ok: true })
      }
      if (req.method === 'PUT' && url.pathname === '/api/config') {
        const body = await readBody(req)
        return json(res, 200, controller.saveConfig(body))
      }
      return json(res, 404, { error: 'No existe.' })
    } catch (e) {
      return json(res, 400, { error: e.message })
    }
  })

  server.listen(controller.port, '0.0.0.0')
  const lan = lanAddress()
  return {
    server,
    urls: {
      local: `http://localhost:${controller.port}/?t=${controller.token}`,
      lan: lan ? `http://${lan}:${controller.port}/?t=${controller.token}` : null
    }
  }
}

module.exports = { startPanelServer, lanAddress }
