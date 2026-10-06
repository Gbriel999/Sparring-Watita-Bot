'use strict'
// Run with: node --test
const test = require('node:test')
const assert = require('node:assert')
const { parseHeader, sampleStart, crossRow } = require('./cruzar-muestras')

const sample = [
  '# tipo: Legit',
  '# cheat: -',
  '# rival: bot · WatitaBot (1.21.11, vanilla)',
  '# inicio: 2026-10-05 12:10:00',
  'tick,x,y'
].join('\n')

test('the "# key: value" header of a lab sample is read until the data starts', () => {
  const header = parseHeader(sample)
  assert.strictEqual(header.tipo, 'Legit')
  assert.strictEqual(header.inicio, '2026-10-05 12:10:00')
  assert.strictEqual(header.tick, undefined)
})

test('the start time is read in the server time zone given as an offset from UTC', () => {
  assert.strictEqual(sampleStart('2026-10-05 12:10:00', -3).toISOString(), '2026-10-05T15:10:00.000Z')
  assert.strictEqual(sampleStart('mal', 0), null)
})

test('a sample against the bot gets the bot setup at its start', () => {
  const timeline = [
    { t: '2026-10-05T15:00:00.000Z', modo: 'pelea', nivel: 'dificil', escudo: false, totem: true, manzanas: true, conectado: true }
  ]
  const row = crossRow('muestra.csv', parseHeader(sample), timeline, -3)
  assert.strictEqual(row.bot_nivel, 'dificil')
  assert.strictEqual(row.bot_escudo, 'no')
})

test('a sample against a person is listed without bot setup', () => {
  const header = parseHeader(sample.replace('rival: bot · WatitaBot (1.21.11, vanilla)', 'rival: Steve (1.21.11, fabric)'))
  const row = crossRow('muestra.csv', header, [{ t: '2026-10-05T15:00:00.000Z', modo: 'pelea', nivel: 'normal' }], -3)
  assert.strictEqual(row.bot_nivel, '')
})
