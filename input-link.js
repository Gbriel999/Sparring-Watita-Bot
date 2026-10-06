'use strict'
// The link with the Watita Sparring Link mod (its own folder, see README): the owner's client, on this same PC,
// sends one JSON line per tick with the game controls held and its state, and the bot learns the owner's
// habits from them (brain/inputs.js). Only on 127.0.0.1, only from the owner, and the mod only sends while
// a fight runs (setFight). The bot never reacts to these frames live: they only feed the learning.
//
// Protocol v1, one JSON object per line (the mod's PROTOCOLO.md has every field):
//   mod -> bot  {"t":"hello","v":1,"player":"...","mc":"26.2"}   then {"t":"tick",...} per tick
//   bot -> mod  {"t":"hello","v":1,"bot":"...","fight":false}    and {"t":"fight","on":true|false}

const net = require('node:net')

const VERSION = 1
const MAX_LINE = 4096
const HOST = '127.0.0.1'

/**
 * @param options { port, owner(): string, botName(): string, onFrame(frame), onStatus?(status), log?(msg) }
 * @returns Promise<{ port, address, setFight(on), status(), close() }>
 */
function createInputLink ({ port, owner, botName, onFrame, onStatus = () => {}, log = () => {} }) {
  let fight = false
  let current = null // { socket, accepted }
  let status = { state: 'esperando' }
  let badLines = 0

  const setStatus = (next) => {
    status = next
    onStatus(snapshot())
  }
  const snapshot = () => (badLines > 0 && status.state === 'conectado' ? { ...status, badLines } : { ...status })
  const write = (socket, message) => {
    if (!socket.destroyed) socket.write(JSON.stringify(message) + '\n')
  }

  function reject (link, reason) {
    log(`Tus teclas: rechazado (${reason})`)
    link.rejected = true
    setStatus({ state: 'rechazado', reason })
    link.socket.destroy()
  }

  function handleLine (link, line) {
    let message
    try {
      message = JSON.parse(line)
    } catch {
      message = null
    }
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      badLines++
      return
    }
    if (!link.accepted) {
      if (message.t !== 'hello') return reject(link, 'el mod no se presentó')
      if (message.v !== VERSION) return reject(link, `versión ${message.v} del mod, el bot usa la ${VERSION}`)
      const player = typeof message.player === 'string' ? message.player : ''
      const expected = String(owner() || '')
      if (!expected || player.toLowerCase() !== expected.toLowerCase()) {
        return reject(link, `el mod es de ${player || '?'}, el dueño es ${expected || '?'}`)
      }
      link.accepted = true
      badLines = 0
      write(link.socket, { t: 'hello', v: VERSION, bot: String(botName() || ''), fight })
      log(`Tus teclas: conectado (${player})`)
      setStatus({ state: 'conectado', player })
      return
    }
    if (message.t === 'tick' && fight) onFrame(message)
  }

  const server = net.createServer((socket) => {
    // One mod at a time: a new connection replaces the old one
    if (current) current.socket.destroy()
    const link = { socket, accepted: false, rejected: false }
    current = link
    let buffer = ''
    socket.setEncoding('utf8')
    socket.setNoDelay(true)
    socket.on('data', (chunk) => {
      buffer += chunk
      let index
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 1)
        if (line.length > MAX_LINE) return reject(link, 'línea demasiado larga')
        if (line.trim()) handleLine(link, line)
        if (socket.destroyed) return
      }
      if (buffer.length > MAX_LINE) reject(link, 'línea demasiado larga')
    })
    socket.on('error', () => {})
    socket.on('close', () => {
      if (current !== link) return
      current = null
      if (!link.rejected) setStatus({ state: 'esperando' })
    })
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, HOST, () => {
      server.off('error', reject)
      server.on('error', (error) => log(`Tus teclas: ${error.message}`))
      resolve({
        port: server.address().port,
        address: server.address().address,
        setFight (on) {
          on = Boolean(on)
          if (on === fight) return
          fight = on
          if (current && current.accepted) write(current.socket, { t: 'fight', on })
        },
        status: snapshot,
        close () {
          if (current) current.socket.destroy()
          return new Promise((done) => server.close(() => done()))
        }
      })
    })
  })
}

module.exports = { createInputLink, MAX_LINE, VERSION }
