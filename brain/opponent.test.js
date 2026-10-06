'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { OpponentModel } = require('./opponent')

const tickBase = { targetOnGround: true, targetBlocking: false, botPos: { x: 0, y: 0, z: 0 }, botStrafe: null, targetAimError: null }

test('reach is learned from the distance of the hits the rival lands', () => {
  const m = new OpponentModel()
  assert.strictEqual(m.summary().reach, null)
  for (const d of [2.6, 2.9, 3.0, 2.8]) m.observeHitTaken({ tick: 1, distance: d, targetFalling: false })
  assert.strictEqual(m.summary().reach.median, 2.9)
  assert.ok(m.summary().confidence.reach > 0)
})

test('swing rhythm predicts when the rival sword is charged again', () => {
  const m = new OpponentModel()
  let tick = 100
  for (let i = 0; i < 6; i++) { m.observeSwing(tick); tick += 13 }
  assert.strictEqual(m.summary().swingInterval, 13)
  assert.strictEqual(m.summary().spamRate, 0)
  assert.strictEqual(m.enemyReadyIn(tick - 13 + 5), 8)
})

/**
 * One knockback flight of a rival hit on the ground at z 3 by a sprint hit (pushed toward +Z), fed the
 * way the engine sees it: the damage event at t0, then the rival's positions. `jump` makes it a jump
 * reset (vy 0.42 and 0.6 of the push), `kbScale` scales the push it really takes. On a server the
 * flight only shows up `delay` ticks after the damage event and positions come every `every` ticks;
 * the ticks in between repeat the last position seen.
 */
function feedFlight (m, t0, { jump = false, kbScale = 1, every = 1, delay = 0 } = {}) {
  m.observeHitLanded({ tick: t0, sprintHit: true, targetPos: { x: 0, y: 0, z: 3 }, targetOnGround: true })
  const path = []
  let y = 0
  let vy = jump ? 0.42 : 0.4
  let z = 3
  let vz = 0.7 * (jump ? 0.6 : 1) * kbScale
  for (let i = 1; i <= 14; i++) {
    z += vz
    vz *= i === 1 || i > 10 ? 0.546 : 0.91
    y += vy
    vy = (vy - 0.08) * 0.98
    if (y <= 0) {
      y = 0
      vy = 0
    }
    path.push({ x: 0, y, z })
  }
  let seen = { x: 0, y: 0, z: 3 }
  for (let tick = t0 + 1; tick <= t0 + delay + 14; tick++) {
    const flown = tick - t0 - delay
    if (flown >= 1 && flown % every === 0) seen = path[flown - 1]
    m.observeTick({ ...tickBase, tick, distance: seen.z, targetPos: seen, targetVel: { x: 0, y: 0, z: 0 } })
  }
}

// Rewritten for the new jump-reset rule (final review I1): the old version fed one tick with vy 0.42
// and read the jump from that tick's vy. The jump reset is now read from the peak of the flight, so
// the test feeds the whole flight; the claim is unchanged (a jump reset, and less knockback taken).
test('a rival that jumps right after being hit is a jump resetter with less knockback', () => {
  const m = new OpponentModel()
  for (let i = 0; i < 4; i++) feedFlight(m, i * 100, { jump: true, kbScale: 0.7 })
  const s = m.summary()
  assert.strictEqual(s.jumpResetRate, 1)
  assert.ok(s.kbFactor > 0 && s.kbFactor < 1)
  assert.ok(Math.abs(s.kbFactor - 0.7) < 0.02, `kbFactor ${s.kbFactor}`)
})

test('the knockback is timed from the first position update that shows it, not from the damage event', () => {
  // A server sends the rival every 2 ticks, and its flight shows up only after its own round trip
  for (const delay of [0, 1, 2, 3, 4]) {
    const plain = new OpponentModel()
    const resetter = new OpponentModel()
    for (let i = 0; i < 4; i++) {
      feedFlight(plain, i * 100, { every: 2, delay })
      feedFlight(resetter, i * 100, { jump: true, every: 2, delay })
    }
    const p = plain.summary()
    const r = resetter.summary()
    assert.strictEqual(p.jumpResetRate, 0, `delay ${delay}: the hop is not a jump reset`)
    assert.ok(p.kbFactor > 0.9 && p.kbFactor < 1.15, `delay ${delay}: kbFactor ${p.kbFactor}`)
    assert.strictEqual(r.jumpResetRate, 1, `delay ${delay}: the jump is a jump reset`)
    assert.ok(r.kbFactor > 0.9 && r.kbFactor < 1.15, `delay ${delay}: jump reset kbFactor ${r.kbFactor}`)
  }
})

test('a hit whose knockback never shows up is dropped after 10 ticks', () => {
  const m = new OpponentModel()
  for (let i = 0; i < 4; i++) {
    const t0 = i * 100
    m.observeHitLanded({ tick: t0, sprintHit: true, targetPos: { x: 0, y: 0, z: 3 }, targetOnGround: true })
    // Walking away on the ground is not the knockback: nothing rises
    for (let t = 1; t <= 10; t++) m.observeTick({ ...tickBase, tick: t0 + t, distance: 3, targetPos: { x: 0, y: 0, z: 3 + 0.2 * t } })
    // The rise comes too late to belong to the hit
    m.observeTick({ ...tickBase, tick: t0 + 11, distance: 3, targetPos: { x: 0, y: 0.4, z: 5.2 } })
  }
  assert.strictEqual(m.summary().kbFactor, null)
})

test('the rival orbit direction is learned (counter-clockwise is positive)', () => {
  const m = new OpponentModel()
  // Target at +Z of the bot moving to -X: r = (0,0,3), v = (-0.2,0,0): cross = 3 * -0.2 < 0 → clockwise
  for (let t = 0; t < 50; t++) m.observeTick({ ...tickBase, tick: t, distance: 3, targetPos: { x: 0, y: 0, z: 3 }, targetVel: { x: -0.2, y: 0, z: 0 } })
  assert.ok(m.summary().orbit < -0.9)
})

test('the weak side is the bot strafe direction where the rival aims worse', () => {
  const m = new OpponentModel()
  for (let t = 0; t < 40; t++) {
    m.observeTick({ ...tickBase, tick: t, distance: 3, targetPos: { x: 0, y: 0, z: 3 }, targetVel: { x: 0, y: 0, z: 0 }, botStrafe: 'left', targetAimError: 0.25 })
    m.observeTick({ ...tickBase, tick: t + 100, distance: 3, targetPos: { x: 0, y: 0, z: 3 }, targetVel: { x: 0, y: 0, z: 0 }, botStrafe: 'right', targetAimError: 0.05 })
  }
  assert.strictEqual(m.summary().weakSide, 'left')
})

test('a saved model comes back as a prior with half the weight', () => {
  const m = new OpponentModel()
  for (const d of [2.6, 2.9, 3.0, 2.8, 2.7, 2.9]) m.observeHitTaken({ tick: 1, distance: d, targetFalling: true })
  const back = OpponentModel.fromJSON(JSON.parse(JSON.stringify(m.toJSON())))
  assert.strictEqual(back.summary().critRate, 1)
  assert.ok(back.summary().confidence.reach < m.summary().confidence.reach)
})

// Rewritten for the new jump-reset rule (final review I1): the old version fed one tick with vy 0.4.
// It now feeds the whole hop (peak about 1.15 blocks); the claim is unchanged.
test('a rival that only gets the knockback hop (vy 0.4) is not a jump resetter', () => {
  const m = new OpponentModel()
  for (let i = 0; i < 4; i++) feedFlight(m, i * 100)
  assert.strictEqual(m.summary().jumpResetRate, 0)
  assert.ok(Math.abs(m.summary().kbFactor - 1) < 0.02, `kbFactor ${m.summary().kbFactor}`)
})
