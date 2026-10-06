'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { RivalMemory } = require('./memory')
const { OpponentModel } = require('./opponent')

function tempFile () {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rivales-')), 'rivales.json')
}

test('a rival is remembered by name, ignoring case, and counts fights', () => {
  const file = tempFile()
  const memory = new RivalMemory(file)
  const m = memory.load('Gvvbriel')
  for (const d of [2.6, 2.9, 3.0]) m.observeHitTaken({ tick: 1, distance: d, targetFalling: false })
  assert.strictEqual(memory.save('Gvvbriel', m, { fightEnded: true }), true)
  const again = new RivalMemory(file)
  assert.strictEqual(again.info('gvvbriel').fights, 1)
  assert.ok(again.load('GVVBRIEL').summary().reach)
})

test('forgetting a rival removes it; a broken file never throws', () => {
  const file = tempFile()
  const memory = new RivalMemory(file)
  memory.save('x', new OpponentModel(), { fightEnded: true })
  assert.strictEqual(memory.forget('X'), true)
  assert.strictEqual(memory.info('x'), null)
  fs.writeFileSync(file, '{not json')
  assert.ok(new RivalMemory(file).load('x') instanceof OpponentModel)
})
