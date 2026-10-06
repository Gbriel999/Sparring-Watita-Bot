'use strict'
// Run with: node --test
const test = require('node:test')
const assert = require('node:assert')
const { InputLog, FrameMeter } = require('./panel-telemetry')

test('held keys collapse into one entry that counts its frames', () => {
  const log = new InputLog(10)
  log.push({ forward: true, sprint: true }, null)
  log.push({ forward: true, sprint: true }, null)
  log.push({ forward: true, sprint: true }, null)
  log.push({ forward: true }, null)
  const entries = log.entries()
  assert.strictEqual(entries.length, 2)
  assert.deepStrictEqual(entries[0].keys, ['forward'])
  assert.strictEqual(entries[0].frames, 1)
  assert.deepStrictEqual(entries[1].keys, ['forward', 'sprint'])
  assert.strictEqual(entries[1].frames, 3)
})

test('an attack is its own one-frame entry, newest first', () => {
  const log = new InputLog(10)
  log.push({ forward: true }, null)
  log.push({ forward: true }, 'crit')
  log.push({ forward: true }, null)
  const entries = log.entries()
  assert.deepStrictEqual(entries.map((e) => [e.attack, e.frames]), [[null, 1], ['crit', 1], [null, 1]])
})

test('the log keeps only the newest entries', () => {
  const log = new InputLog(3)
  for (let i = 0; i < 5; i++) log.push({ jump: i % 2 === 0 }, null)
  assert.strictEqual(log.entries().length, 3)
})

test('frame meter keeps the last ticks with charge, attack and damage', () => {
  const meter = new FrameMeter(4)
  meter.push(0.5, null, false)
  meter.push(1, 'sprint', false)
  meter.push(0, null, true)
  meter.push(0.1, null, false)
  meter.push(0.2, null, false)
  assert.deepStrictEqual(meter.frames(), [
    { c: 1, a: 'sprint', k: false },
    { c: 0, a: null, k: true },
    { c: 0.1, a: null, k: false },
    { c: 0.2, a: null, k: false }
  ])
})
