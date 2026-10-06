'use strict'
// Run with: node --test
const test = require('node:test')
const assert = require('node:assert')
const { Vec3 } = require('vec3')
const c = require('./combat')

const DEG = Math.PI / 180

test('look angles follow the mineflayer convention', () => {
  // Yaw 0 looks to -Z (north), positive pitch looks up
  const ahead = c.anglesTo(new Vec3(0, 1.62, 0), new Vec3(0, 1.62, -3))
  assert.ok(Math.abs(ahead.yaw) < 1e-9)
  assert.ok(Math.abs(ahead.pitch) < 1e-9)
  const up = c.anglesTo(new Vec3(0, 0, 0), new Vec3(0, 1, -1))
  assert.ok(Math.abs(up.pitch - 45 * DEG) < 1e-9)
})

test('angle wrap stays in (-pi, pi]', () => {
  assert.ok(Math.abs(c.wrapAngle(3 * Math.PI) - Math.PI) < 1e-9)
  assert.ok(Math.abs(c.wrapAngle(-3 * Math.PI / 2) - Math.PI / 2) < 1e-9)
})

test('aim step turns part of the way, never faster than the cap, and takes the short way round', () => {
  const noJitter = () => 0.5
  const step = c.aimStep({ yaw: 0, pitch: 0 }, { yaw: 60 * DEG, pitch: 0 }, 0.5, 20 * DEG, 0, noJitter)
  assert.ok(Math.abs(step.yaw - 20 * DEG) < 1e-9, 'capped at 20 degrees')
  const small = c.aimStep({ yaw: 0, pitch: 0 }, { yaw: 10 * DEG, pitch: 0 }, 0.5, 20 * DEG, 0, noJitter)
  assert.ok(Math.abs(small.yaw - 5 * DEG) < 1e-9, 'half of the remaining 10')
  const across = c.aimStep({ yaw: 170 * DEG, pitch: 0 }, { yaw: -170 * DEG, pitch: 0 }, 1, 90 * DEG, 0, noJitter)
  assert.ok(Math.abs(c.wrapAngle(across.yaw - (-170 * DEG))) < 1e-9, 'crossed 180 instead of turning 340')
})

test('crosshair hits the box only when looking at it within reach', () => {
  const eye = new Vec3(0, 1.62, 0)
  const box = c.entityBox(new Vec3(0, 0, -2.5), 0.6, 1.8)
  assert.ok(c.rayHitsBox(eye, 0, 0, box, 3))
  assert.ok(!c.rayHitsBox(eye, 90 * DEG, 0, box, 3), 'looking sideways')
  const far = c.entityBox(new Vec3(0, 0, -4), 0.6, 1.8)
  assert.ok(!c.rayHitsBox(eye, 0, 0, far, 3), 'out of reach')
})

test('weapon cooldowns match 1.9+ attack speeds', () => {
  assert.strictEqual(c.cooldownTicks('diamond_sword'), 13)
  assert.strictEqual(c.cooldownTicks('netherite_axe'), 20)
  assert.strictEqual(c.cooldownTicks('wooden_axe'), 25)
  assert.strictEqual(c.cooldownTicks(null), 5, 'empty hand')
})

test('delayed history returns where the target was a reaction time ago', () => {
  const history = new c.PositionHistory(40)
  for (let t = 0; t <= 1000; t += 50) history.push(t, new Vec3(t / 100, 0, 0))
  const seen = history.at(1000 - 200)
  assert.ok(Math.abs(seen.x - 8) < 1e-9)
  assert.ok(history.at(-5000).x === 0, 'older than the history: the oldest known')
})

test('attack charge follows the 1.9+ cooldown of the held weapon', () => {
  const bot = { heldItem: { name: 'diamond_sword' }, setControlState () {} }
  const engine = new c.CombatEngine(bot, { getTarget: () => null, shieldAllowed: () => true, paused: () => false })
  engine.tick = 100
  engine.lastAttackTick = 100
  assert.strictEqual(engine.charge().value, 0)
  engine.tick = 106
  assert.ok(Math.abs(engine.charge().value - 6 / 13) < 1e-9)
  engine.tick = 130
  assert.strictEqual(engine.charge().value, 1)
  assert.strictEqual(engine.charge().cooldown, 13)
})

test('every swing is reported to the attack listener with its kind', () => {
  const kinds = []
  const bot = { heldItem: null, setControlState () {}, swingArm () {} }
  const engine = new c.CombatEngine(bot, {
    getTarget: () => null, shieldAllowed: () => true, paused: () => false, onAttack: (kind) => kinds.push(kind)
  })
  engine.swingAir()
  assert.deepStrictEqual(kinds, ['air'])
})

test('in sight is judged like the server: from the last sent eye, not the newer one', () => {
  // The rival stands 3.4 blocks away on +Z (its box starts at 3.1). The bot's last packet put it at
  // z 0.25 (2.85 to the box); it has since stepped back to z -0.2 (3.3 to the box), not sent yet.
  const target = { position: new Vec3(0, 0, 3.4), width: 0.6, height: 1.8 }
  const bot = { entity: { position: new Vec3(0, 0, -0.2), yaw: Math.PI, pitch: 0 }, setControlState () {} }
  const engine = new c.CombatEngine(bot, { getTarget: () => target, shieldAllowed: () => true, paused: () => false })
  engine.sentPos = new Vec3(0, 0, 0.25)
  engine.prevSentPos = new Vec3(0, 0, 0.25)
  assert.strictEqual(engine.inSight(target), true)
  // Looking away, it is not in sight from anywhere
  bot.entity.yaw = 0
  assert.strictEqual(engine.inSight(target), false)
  // Out of reach from the sent eye: not in sight even if the newer eye is closer
  engine.sentPos = new Vec3(0, 0, -0.3)
  bot.entity.position = new Vec3(0, 0, 0.3)
  bot.entity.yaw = Math.PI
  assert.strictEqual(engine.inSight(target), false)
})
