'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { EventEmitter } = require('node:events')
const { installRivalGroundFix, MOVE_PACKETS } = require('./rival-ground')

function fakeBot () {
  // prismarine-entity starts every entity with onGround true and mineflayer never changes it
  return { _client: new EventEmitter(), entities: { 5: { id: 5, onGround: true } } }
}

test('every entity move packet carries the server onGround flag to the entity', () => {
  const bot = fakeBot()
  installRivalGroundFix(bot)
  for (const name of MOVE_PACKETS) {
    bot._client.emit(name, { entityId: 5, onGround: false })
    assert.strictEqual(bot.entities[5].onGround, false, name)
    bot._client.emit(name, { entityId: 5, onGround: true })
    assert.strictEqual(bot.entities[5].onGround, true, name)
  }
})

test('an entity mineflayer creates after our listener still gets the flag', async () => {
  const bot = fakeBot()
  installRivalGroundFix(bot)
  // mineflayer's own handler, registered after ours, creates the entity on its first packet
  bot._client.on('rel_entity_move', (packet) => {
    if (!bot.entities[packet.entityId]) bot.entities[packet.entityId] = { id: packet.entityId, onGround: true }
  })
  bot._client.emit('rel_entity_move', { entityId: 9, onGround: false })
  await Promise.resolve()
  assert.strictEqual(bot.entities[9].onGround, false)
})

test('a packet without the flag leaves the entity alone', () => {
  const bot = fakeBot()
  installRivalGroundFix(bot)
  bot._client.emit('rel_entity_move', { entityId: 5 })
  assert.strictEqual(bot.entities[5].onGround, true)
})
