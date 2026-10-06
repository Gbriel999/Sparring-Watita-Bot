'use strict'
const test = require('node:test')
const assert = require('node:assert')
const net = require('node:net')
const { createInputLink, MAX_LINE } = require('./input-link')

/** A fake mod: connects, collects the bot's lines, and can send its own. */
function connect (port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1')
    const lines = []
    const waiters = []
    let buffer = ''
    let closed = false
    socket.setEncoding('utf8')
    socket.on('data', (chunk) => {
      buffer += chunk
      let index
      while ((index = buffer.indexOf('\n')) >= 0) {
        lines.push(JSON.parse(buffer.slice(0, index)))
        buffer = buffer.slice(index + 1)
      }
      waiters.splice(0).forEach((w) => w())
    })
    socket.on('close', () => { closed = true; waiters.splice(0).forEach((w) => w()) })
    socket.on('error', () => {})
    socket.on('connect', () => resolve({
      send: (obj) => socket.write((typeof obj === 'string' ? obj : JSON.stringify(obj)) + '\n'),
      lines,
      closed: () => closed,
      end: () => socket.destroy(),
      /** Waits until the predicate holds (on new data or close), or fails after 1 s. */
      until (predicate) {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('timeout')), 1000)
          const check = () => {
            if (predicate()) { clearTimeout(timer); resolve() } else waiters.push(check)
          }
          check()
        })
      }
    }))
    socket.on('error', reject)
  })
}

const tick = (seq, extra = {}) => ({ t: 'tick', seq, tick: seq, ms: 0, k: 0, spr: false, gnd: true, vy: 0, hurt: false, dist: 3, aim: true, atk: [], ...extra })
const flush = () => new Promise((resolve) => setTimeout(resolve, 30))

async function setup (options = {}) {
  const frames = []
  const statuses = []
  const link = await createInputLink({
    port: 0,
    owner: () => 'gvvbriel',
    botName: () => 'WatitaBot',
    onFrame: (frame) => frames.push(frame),
    onStatus: (status) => statuses.push(status),
    ...options
  })
  return { link, frames, statuses }
}

test('a hello from the owner gets the bot hello and the link is connected', async () => {
  const { link, statuses } = await setup()
  try {
    assert.deepStrictEqual(link.status(), { state: 'esperando' })
    const mod = await connect(link.port)
    mod.send({ t: 'hello', v: 1, player: 'GvvBriel', mc: '26.2' })
    await mod.until(() => mod.lines.length >= 1)
    assert.deepStrictEqual(mod.lines[0], { t: 'hello', v: 1, bot: 'WatitaBot', fight: false })
    assert.deepStrictEqual(link.status(), { state: 'conectado', player: 'GvvBriel' })
    assert.deepStrictEqual(statuses[statuses.length - 1], { state: 'conectado', player: 'GvvBriel' })
    mod.end()
  } finally {
    await link.close()
  }
})

test('another player or another protocol version is refused and closed', async () => {
  const { link } = await setup()
  try {
    const stranger = await connect(link.port)
    stranger.send({ t: 'hello', v: 1, player: 'Otro', mc: '26.2' })
    await stranger.until(() => stranger.closed())
    assert.strictEqual(link.status().state, 'rechazado')
    assert.match(link.status().reason, /Otro/)
    const old = await connect(link.port)
    old.send({ t: 'hello', v: 2, player: 'gvvbriel', mc: '26.2' })
    await old.until(() => old.closed())
    assert.match(link.status().reason, /versión/)
  } finally {
    await link.close()
  }
})

test('the fight switch reaches the mod, and only ticks inside a fight are passed on', async () => {
  const { link, frames } = await setup()
  try {
    const mod = await connect(link.port)
    mod.send({ t: 'hello', v: 1, player: 'gvvbriel', mc: '26.2' })
    await mod.until(() => mod.lines.length >= 1)
    mod.send(tick(1))
    await flush()
    assert.strictEqual(frames.length, 0, 'no fight: ignored')
    link.setFight(true)
    await mod.until(() => mod.lines.length >= 2)
    assert.deepStrictEqual(mod.lines[1], { t: 'fight', on: true })
    mod.send(tick(2, { k: 65 }))
    await flush()
    assert.strictEqual(frames.length, 1)
    assert.strictEqual(frames[0].seq, 2)
    assert.strictEqual(frames[0].k, 65)
    link.setFight(false)
    await mod.until(() => mod.lines.length >= 3)
    assert.deepStrictEqual(mod.lines[2], { t: 'fight', on: false })
    mod.end()
  } finally {
    await link.close()
  }
})

test('a broken line is skipped, a line over the limit closes the link', async () => {
  const { link, frames } = await setup()
  try {
    link.setFight(true)
    const mod = await connect(link.port)
    mod.send({ t: 'hello', v: 1, player: 'gvvbriel', mc: '26.2' })
    await mod.until(() => mod.lines.length >= 1)
    assert.deepStrictEqual(mod.lines[0], { t: 'hello', v: 1, bot: 'WatitaBot', fight: true })
    mod.send('{"t":"tick",')
    mod.send(tick(3))
    await flush()
    assert.strictEqual(frames.length, 1)
    assert.strictEqual(link.status().badLines, 1)
    mod.send('x'.repeat(MAX_LINE + 10))
    await mod.until(() => mod.closed())
    assert.strictEqual(link.status().state, 'rechazado')
  } finally {
    await link.close()
  }
})

test('a new connection replaces the old one', async () => {
  const { link } = await setup()
  try {
    const first = await connect(link.port)
    first.send({ t: 'hello', v: 1, player: 'gvvbriel', mc: '26.2' })
    await first.until(() => first.lines.length >= 1)
    const second = await connect(link.port)
    await first.until(() => first.closed())
    second.send({ t: 'hello', v: 1, player: 'gvvbriel', mc: '26.2' })
    await second.until(() => second.lines.length >= 1)
    assert.strictEqual(link.status().state, 'conectado')
    second.end()
  } finally {
    await link.close()
  }
})

test('the link only listens on 127.0.0.1', async () => {
  const { link } = await setup()
  try {
    assert.strictEqual(link.address, '127.0.0.1')
  } finally {
    await link.close()
  }
})
