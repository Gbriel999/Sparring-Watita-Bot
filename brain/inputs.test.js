'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { InputHabits, KEYS } = require('./inputs')

const { FORWARD, BACK, LEFT, RIGHT, JUMP } = KEYS

/** Feeds frames with consecutive seqs; each spec is { k, hurt, gnd, atk } (defaults: nothing held, on the ground). */
function feed (habits, specs, start = 1) {
  let seq = start
  for (const spec of specs) {
    habits.observeFrame({ t: 'tick', seq, tick: seq, ms: 0, k: 0, spr: false, gnd: true, vy: 0, hurt: false, dist: 3, aim: true, atk: [], ...spec })
    seq++
  }
  return seq
}

const click = (extra = {}) => ({ c: 1, gnd: true, vy: 0, spr: false, aim: true, dist: 2.9, ...extra })
const idle = (n, extra = {}) => Array.from({ length: n }, () => ({ ...extra }))

test('click charge: spam rate, median charge and the swing rhythm', () => {
  const h = new InputHabits()
  assert.strictEqual(h.summary().spamRate, null)
  const specs = []
  // 12 clicks 13 ticks apart: 9 charged (1.0), 3 spammed (0.5)
  for (let i = 0; i < 12; i++) specs.push({ atk: [click({ c: i < 3 ? 0.5 : 1 })] }, ...idle(12))
  feed(h, specs)
  const s = h.summary()
  assert.strictEqual(s.spamRate, 0.25)
  assert.strictEqual(s.hitCharge, 1)
  assert.strictEqual(s.swingInterval, 13)
  assert.ok(s.confidence.spamRate > 0)
})

test('clicks far from the bot do not count as fight clicks', () => {
  const h = new InputHabits()
  const specs = []
  for (let i = 0; i < 12; i++) specs.push({ atk: [click({ c: 0.2, dist: 8, aim: false })] }, ...idle(12))
  feed(h, specs)
  assert.strictEqual(h.summary().spamRate, null)
})

test('crit attempts: aimed clicks in the air, falling, without sprint', () => {
  const h = new InputHabits()
  const specs = []
  for (let i = 0; i < 10; i++) {
    const crit = i < 4
    specs.push({ gnd: !crit, atk: [click({ gnd: !crit, vy: crit ? -0.2 : 0 })] }, ...idle(12))
  }
  // A rising air click is not a crit attempt, and a sprinting falling one neither
  specs.push({ atk: [click({ gnd: false, vy: 0.3 })] }, ...idle(12), { atk: [click({ gnd: false, vy: -0.2, spr: true })] }, ...idle(12))
  feed(h, specs)
  assert.strictEqual(h.summary().critAttemptRate, 4 / 12)
  assert.strictEqual(h.summary().hitDistance, 2.9)
})

test('w-tap: forward let go within 4 ticks of a sprint click, and for how long', () => {
  const h = new InputHabits()
  const specs = []
  for (let i = 0; i < 6; i++) {
    const wtap = i < 4
    // Sprint click while holding W; then 1 tick holding, 2 ticks released (w-tap), W again
    specs.push({ k: FORWARD, spr: true, atk: [click({ spr: true })] })
    if (wtap) specs.push({ k: FORWARD }, { k: 0 }, { k: 0 }, ...idle(10, { k: FORWARD }))
    else specs.push(...idle(13, { k: FORWARD }))
  }
  feed(h, specs)
  const s = h.summary()
  assert.strictEqual(s.wtapRate, 4 / 6)
  assert.strictEqual(s.wtapTicks, 2)
})

test('s-tap: back pressed within 4 ticks of an aimed click', () => {
  const h = new InputHabits()
  const specs = []
  for (let i = 0; i < 6; i++) {
    specs.push({ k: FORWARD, atk: [click()] })
    specs.push(...(i < 3 ? [{ k: 0 }, { k: BACK }, { k: BACK }] : idle(3, { k: FORWARD })), ...idle(10, { k: FORWARD }))
  }
  feed(h, specs)
  assert.strictEqual(h.summary().stapRate, 0.5)
})

test('jump reset: jump within 0-2 ticks of a hit taken on the ground, and how fast', () => {
  const h = new InputHabits()
  const specs = []
  for (let i = 0; i < 8; i++) {
    if (i < 5) specs.push({ hurt: true }, { k: JUMP }, ...idle(15))
    else specs.push({ hurt: true }, ...idle(5), { k: JUMP }, ...idle(10))
  }
  feed(h, specs)
  const s = h.summary()
  assert.strictEqual(s.jumpResetRate, 5 / 8)
  assert.strictEqual(s.jumpResetTicks, 1)
})

test('a hit taken in the air is no jump reset chance', () => {
  const h = new InputHabits()
  const specs = []
  // In the air on the tick before the hit (the hurt tick itself already flies from the knockback)
  for (let i = 0; i < 8; i++) specs.push({ gnd: false }, { hurt: true, gnd: false }, ...idle(15))
  feed(h, specs)
  assert.strictEqual(h.summary().jumpResetRate, null)
})

test('strafe: ticks in a row on only A or only D', () => {
  const h = new InputHabits()
  const specs = []
  for (let i = 0; i < 6; i++) specs.push(...idle(8, { k: LEFT }), ...idle(8, { k: RIGHT }))
  specs.push({ k: 0 })
  feed(h, specs)
  assert.strictEqual(h.summary().strafeLength, 8)
})

test('a gap in the frames breaks the open streaks instead of making data up', () => {
  const h = new InputHabits()
  for (let i = 0; i < 6; i++) {
    // Each strafe run is cut by a lost frame: the halves are not joined into one long run
    const next = feed(h, idle(5, { k: LEFT }), i * 100 + 1)
    feed(h, idle(5, { k: LEFT }), next + 1)
    feed(h, [{ k: 0 }], next + 7)
  }
  assert.strictEqual(h.summary().strafeLength, 5)
})

test('the habits are saved and come back as a prior with half the weight', () => {
  const h = new InputHabits()
  const specs = []
  // Half spammed: the rate survives the halving exactly (12 clicks come back as 10, 6 spammed as 5)
  for (let i = 0; i < 12; i++) specs.push({ atk: [click({ c: i < 6 ? 0.5 : 1 })] }, ...idle(12))
  feed(h, specs)
  const back = InputHabits.fromJSON(JSON.parse(JSON.stringify(h.toJSON())))
  assert.strictEqual(back.summary().spamRate, 0.5)
  assert.ok(back.summary().confidence.spamRate < h.summary().confidence.spamRate)
  const whole = InputHabits.fromJSON(h.toJSON(), { asPrior: false })
  assert.strictEqual(whole.summary().confidence.spamRate, h.summary().confidence.spamRate)
  assert.strictEqual(InputHabits.fromJSON(null).summary().spamRate, null)
})
