'use strict'
const test = require('node:test')
const assert = require('node:assert')
const p = require('./physics')

test('a jump from the ground follows the vanilla arc and lands on tick 12', () => {
  const arc = p.jumpArc()
  assert.strictEqual(arc.length, 12)
  assert.ok(Math.abs(arc[0].y - 0.42) < 1e-9)
  assert.ok(Math.abs(Math.max(...arc.map((a) => a.y)) - 1.2522) < 1e-3)
  assert.strictEqual(arc[11].y, 0)
})

test('the crit window is the falling part of the jump: ticks 7 to 11', () => {
  assert.deepStrictEqual(p.critWindow(), { first: 7, last: 11 })
})

test('the crit jump is planned so the hit lands charged, falling and in reach', () => {
  const plan = p.planCritJump({ untilReady: 9, distance: 3.2, closingSpeed: 0.05 })
  assert.ok(plan)
  const { first, last } = p.critWindow()
  assert.ok(plan.attackAt >= 9)
  assert.ok(plan.attackAt >= plan.jumpIn + first && plan.attackAt <= plan.jumpIn + last)
  const at = 3.2 - 0.05 * plan.attackAt
  assert.ok(at >= 2.0 && at <= 3.0)
  assert.strictEqual(plan.attackAt, 9) // no time wasted when the window allows it
})

test('no crit plan when the rival runs away out of reach', () => {
  assert.strictEqual(p.planCritJump({ untilReady: 2, distance: 3.4, closingSpeed: -0.3 }), null)
})

test('knockback: a sprint hit pushes 0.7, a normal hit 0.4, and the push decays with friction', () => {
  assert.strictEqual(p.knockbackSpeed({ sprintHit: true }), 0.7)
  assert.strictEqual(p.knockbackSpeed({ sprintHit: false }), 0.4)
  // A victim hit on the ground moves its first tick with ground friction (vanilla applies the friction
  // of where it stood), then flies with air friction: 0.4 + 0.4 * 0.546 * (1 + 0.91 + ... + 0.91^4)
  assert.ok(Math.abs(p.knockbackDisplacement({ sprintHit: false, ticks: 6 }) - 1.312349) < 1e-6)
  // Already in the air when hit: air friction from the first tick, 0.4 * (1 - 0.91^6) / 0.09
  assert.ok(Math.abs(p.knockbackDisplacement({ sprintHit: false, ticks: 6, fromGround: false }) - 1.920581) < 1e-6)
  const full = p.knockbackDisplacement({ sprintHit: true, ticks: 13 })
  const reset = p.knockbackDisplacement({ sprintHit: true, ticks: 13, jumpReset: true })
  assert.ok(Math.abs(reset - full * 0.6) < 1e-9)
  assert.ok(p.knockbackDisplacement({ sprintHit: true, ticks: 13, kbFactor: 0.5 }) < full)
})

test('ticks to cover a distance walking and sprinting', () => {
  assert.strictEqual(p.ticksToCover(1.0, { sprint: true }), 4)
  assert.strictEqual(p.ticksToCover(1.0), 5)
  assert.strictEqual(p.ticksToCover(-1), 0)
})

test('a crit needs charge, falling, no sprint, no water, no climbing', () => {
  const ok = { charge: 1, onGround: false, vy: -0.1, sprinting: false }
  assert.strictEqual(p.canCrit(ok), true)
  assert.strictEqual(p.canCrit({ ...ok, sprinting: true }), false)
  assert.strictEqual(p.canCrit({ ...ok, vy: 0.1 }), false)
  assert.strictEqual(p.canCrit({ ...ok, charge: 0.85 }), false)
  assert.strictEqual(p.canCrit({ ...ok, onGround: true }), false)
})
