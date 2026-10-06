'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { EventEmitter } = require('node:events')
const { Vec3 } = require('vec3')
const { installKnockbackFix } = require('./knockback')

function fakeBot () {
  return { _client: new EventEmitter(), entity: { id: 7, velocity: new Vec3(0, 0, 0) } }
}

// What mineflayer's entities plugin does, registered AFTER ours (it injects on a setTimeout)
function mineflayerHandler (bot) {
  bot._client.on('entity_velocity', (packet) => {
    if (packet.entityId === bot.entity.id) {
      bot.entity.velocity.set(packet.velocity.x / 8000, packet.velocity.y / 8000, packet.velocity.z / 8000)
    }
  })
}

test('the real knockback wins even though mineflayer handles the packet after us', async () => {
  const bot = fakeBot()
  let hurts = 0
  installKnockbackFix(bot, () => true, () => hurts++)
  mineflayerHandler(bot)
  bot._client.emit('entity_velocity', { entityId: 7, velocity: { x: 0.4, y: 0.36, z: -0.2 } })
  await Promise.resolve() // the fix runs right after every listener of this packet
  assert.deepStrictEqual([bot.entity.velocity.x, bot.entity.velocity.y, bot.entity.velocity.z], [0.4, 0.36, -0.2])
  assert.strictEqual(hurts, 1)
})

test('other entities and old protocol versions are left alone', async () => {
  const bot = fakeBot()
  installKnockbackFix(bot, () => false, () => {})
  mineflayerHandler(bot)
  bot._client.emit('entity_velocity', { entityId: 7, velocity: { x: 8000, y: 0, z: 0 } })
  await Promise.resolve()
  assert.strictEqual(bot.entity.velocity.x, 1, 'old format: mineflayer is right')

  const other = fakeBot()
  installKnockbackFix(other, () => true, () => {})
  other._client.emit('entity_velocity', { entityId: 99, velocity: { x: 0.4, y: 0, z: 0 } })
  await Promise.resolve()
  assert.strictEqual(other.entity.velocity.x, 0)
})
