'use strict'
// Run with: node --test
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createFightLog, settingsAt } = require('./fight-log')

function tempFile () {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'peleas-')), 'peleas.jsonl')
}

const base = { modo: 'quieto', nivel: 'normal', escudo: true, totem: true, manzanas: true, conectado: true }

test('only changes of the bot setup are written, one JSON line each', () => {
  const file = tempFile()
  const log = createFightLog(file)
  log.record(base, new Date('2026-10-05T10:00:00Z'))
  log.record(base, new Date('2026-10-05T10:00:01Z'))
  log.record({ ...base, modo: 'pelea' }, new Date('2026-10-05T10:00:05Z'))
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  assert.strictEqual(lines.length, 2)
  assert.strictEqual(lines[1].modo, 'pelea')
  assert.strictEqual(lines[1].t, '2026-10-05T10:00:05.000Z')
})

test('a fight start time maps to the setup the bot had then', () => {
  const timeline = [
    { t: '2026-10-05T10:00:00.000Z', ...base },
    { t: '2026-10-05T10:05:00.000Z', ...base, modo: 'pelea', nivel: 'dificil' },
    { t: '2026-10-05T10:20:00.000Z', ...base, modo: 'quieto' }
  ]
  assert.strictEqual(settingsAt(timeline, new Date('2026-10-05T10:10:00Z')).nivel, 'dificil')
  assert.strictEqual(settingsAt(timeline, new Date('2026-10-05T10:25:00Z')).modo, 'quieto')
  assert.strictEqual(settingsAt(timeline, new Date('2026-10-05T09:00:00Z')), null)
})
