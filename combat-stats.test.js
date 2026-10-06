'use strict'
// Run with: node --test
const test = require('node:test')
const assert = require('node:assert')
const { CombatStats } = require('./combat-stats')

test('an attack counts as landed only when the target is hurt right after it', () => {
  const stats = new CombatStats({ confirmMs: 350 })
  stats.attack('crit', 1000)
  stats.targetHurt(1120)
  const s = stats.snapshot(1200)
  assert.strictEqual(s.landed, 1)
  assert.strictEqual(s.missed, 0)
  assert.strictEqual(s.crits, 1)
})

test('an attack the server did not turn into damage becomes a miss once the window closes', () => {
  const stats = new CombatStats({ confirmMs: 350 })
  stats.attack('sprint', 1000)
  assert.strictEqual(stats.snapshot(1200).missed, 0) // still waiting
  const s = stats.snapshot(1400)
  assert.strictEqual(s.landed, 0)
  assert.strictEqual(s.missed, 1)
  assert.strictEqual(s.sprintHits, 0)
})

test('the target hurt by something else, with no attack pending, is not a landed hit', () => {
  const stats = new CombatStats()
  stats.targetHurt(500)
  assert.strictEqual(stats.snapshot(600).landed, 0)
})

test('swings at the air are misses and accuracy is landed over all swings', () => {
  const stats = new CombatStats({ confirmMs: 350 })
  stats.attack('hit', 0)
  stats.targetHurt(100)
  stats.attack('hit', 1000)
  stats.targetHurt(1100)
  stats.attack('hit', 2000)
  stats.targetHurt(2050)
  stats.swingAir(3000)
  const s = stats.snapshot(4000)
  assert.strictEqual(s.landed, 3)
  assert.strictEqual(s.missed, 1)
  assert.strictEqual(s.accuracy, 0.75)
})

test('accuracy is unknown before the first swing', () => {
  assert.strictEqual(new CombatStats().snapshot(0).accuracy, null)
})

test('damage received counts the hits, adds the health lost and breaks the combo', () => {
  const stats = new CombatStats({ confirmMs: 350 })
  for (let i = 0; i < 3; i++) {
    stats.attack('hit', i * 1000)
    stats.targetHurt(i * 1000 + 50)
  }
  stats.selfHurt(4.5, 3500)
  stats.attack('hit', 4000)
  stats.targetHurt(4050)
  const s = stats.snapshot(5000)
  assert.strictEqual(s.received, 1)
  assert.strictEqual(s.damageTaken, 4.5)
  assert.strictEqual(s.combo, 1)
  assert.strictEqual(s.comboMax, 3)
})

test('reset starts a new session', () => {
  const stats = new CombatStats()
  stats.swingAir(10)
  stats.totemPop()
  stats.death()
  stats.reset(50)
  const s = stats.snapshot(60)
  assert.deepStrictEqual([s.missed, s.totems, s.deaths, s.since], [0, 0, 0, 50])
})

test('health lost is added separately from the hit that caused it', () => {
  const stats = new CombatStats()
  stats.selfHurt(0, 100)
  stats.healthLost(3)
  stats.healthLost(-2) // healing is not damage
  const s = stats.snapshot(200)
  assert.strictEqual(s.received, 1)
  assert.strictEqual(s.damageTaken, 3)
})
