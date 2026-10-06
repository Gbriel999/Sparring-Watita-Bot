'use strict'
const test = require('node:test')
const assert = require('node:assert')
const t = require('./tactics')

const empty = { samples: 0, reach: null, swingInterval: null, spamRate: null, jumpResetRate: null, kbFactor: null, orbit: null, strafeLength: null, weakSide: null, critRate: null, blockRate: null, aggression: null, preferredDistance: null, confidence: { reach: 0, rhythm: 0, jumpReset: 0, kb: 0, strafe: 0, weakSide: 0, crit: 0, block: 0 } }
const expert = { critChance: 0.5, modelWeight: 1, planNoise: 0, predictKnockback: true, hitDistance: 2.9, holdMargin: 0.35, dodgeOnReady: 1, shieldChance: 1 }
const always = () => 0
const never = () => 0.999

test('far away or chasing means a sprint hit', () => {
  assert.strictEqual(t.chooseHitStyle({ distance: 5, closingSpeed: 0, comboFor: 0, comboAgainst: 0 }, empty, expert, always).style, 'sprint')
  assert.strictEqual(t.chooseHitStyle({ distance: 3, closingSpeed: -0.3, comboFor: 0, comboAgainst: 0 }, empty, expert, always).style, 'sprint')
})

test('against a jump resetter the expert goes for crits and says why', () => {
  const jr = { ...empty, jumpResetRate: 0.72, confidence: { ...empty.confidence, jumpReset: 1 } }
  const r = t.chooseHitStyle({ distance: 3, closingSpeed: 0, comboFor: 0, comboAgainst: 0 }, jr, expert, always)
  assert.strictEqual(r.style, 'crit')
  assert.match(r.reason, /jump reset el 72 %/)
})

test('waiting for the charge it holds just outside the rival reach', () => {
  const m = { ...empty, reach: { median: 2.9, p90: 3.0 }, confidence: { ...empty.confidence, reach: 1 } }
  const r = t.planSpacing({ distance: 2.7, untilReady: 10, enemyReadyIn: 8, style: 'sprint' }, m, expert)
  assert.strictEqual(r.back, true)
  assert.match(r.reason, /Me quedo a 3,4: llegas hasta 3,0/)
})

test('almost charged it walks in to hit at its hit distance', () => {
  const r = t.planSpacing({ distance: 3.4, untilReady: 1, enemyReadyIn: null, style: 'sprint' }, empty, expert)
  assert.strictEqual(r.forward, true)
  assert.strictEqual(r.sprint, true)
})

test('after a sprint hit the w-tap always re-arms the sprint and an s-tap fixes a close rival', () => {
  const far = t.planAfterHit({ sprintHit: true, distance: 2.9, cooldown: 13, enemyReadyIn: null }, empty, expert, always)
  assert.ok(far.wtap >= 1)
  const jr = { ...empty, kbFactor: 0.05, jumpResetRate: 1, confidence: { ...empty.confidence, kb: 1, jumpReset: 1 } }
  const close = t.planAfterHit({ sprintHit: true, distance: 2.0, cooldown: 13, enemyReadyIn: null }, jr, expert, always)
  assert.ok(close.stap >= 2)
  assert.match(close.reason, /S-tap/)
})

test('strafe dodges right when the rival sword gets charged, and prefers its weak side', () => {
  const dodge = t.planStrafe({ tick: 50, enemyReadyIn: 1 }, empty, expert, always, { dir: 'left', until: 80, dodgedAt: -100 })
  assert.strictEqual(dodge.dir, 'right')
  assert.match(dodge.reason, /Esquiva/)
  const weak = { ...empty, weakSide: 'left', confidence: { ...empty.confidence, weakSide: 1 } }
  const pick = t.planStrafe({ tick: 100, enemyReadyIn: null }, weak, expert, always, { dir: null, until: 0, dodgedAt: -100 })
  assert.strictEqual(pick.dir, 'left')
  // The key is the bot's; the text speaks from the rival's side (the bot's left is its right)
  assert.strictEqual(pick.reason, 'Strafe a la izquierda: apuntas peor cuando me muevo a tu derecha')
  const right = t.planStrafe({ tick: 100, enemyReadyIn: null }, { ...weak, weakSide: 'right' }, expert, always, { dir: null, until: 0, dodgedAt: -100 })
  assert.strictEqual(right.dir, 'right')
  assert.strictEqual(right.reason, 'Strafe a la derecha: apuntas peor cuando me muevo a tu izquierda')
})

test('the approach reason gives the hit distance with one decimal', () => {
  const go = t.planSpacing({ distance: 3.4, untilReady: 0, enemyReadyIn: null, style: 'sprint' }, empty, expert)
  assert.strictEqual(go.reason, 'Entro para pegar a 2,9')
})

test('the shield goes up only when the rival hit is coming and ours is not ready', () => {
  const ctx = { hasShield: true, shieldAllowed: true, distance: 2.8, untilReady: 6, enemyReadyIn: 0 }
  assert.strictEqual(t.planShield(ctx, empty, expert).active, true)
  assert.strictEqual(t.planShield({ ...ctx, untilReady: 1 }, empty, expert).active, false)
  assert.strictEqual(t.planShield({ ...ctx, hasShield: false }, empty, expert).active, false)
})

test('two hits taken in a row trigger a combo break', () => {
  assert.strictEqual(t.comboBreak({ comboAgainst: 2 }).active, true)
  assert.strictEqual(t.comboBreak({ comboAgainst: 1 }).active, false)
})

test('the w-tap reason counts ticks in good Spanish and says when there is no w-tap', () => {
  // Sprint hit with nothing to wait for: the minimum 1-tick w-tap, singular
  const one = t.planAfterHit({ sprintHit: true, distance: 2.9, cooldown: 13, enemyReadyIn: null }, empty, expert, always)
  assert.strictEqual(one.wtap, 1)
  assert.match(one.reason, /^W-tap de 1 tick: te vas a \d+,\d$/)
  // Plain hit with a fast weapon (empty hand, 5 ticks): the rival is still flying when it recharges
  const none = t.planAfterHit({ sprintHit: false, distance: 3.0, cooldown: 5, enemyReadyIn: null }, empty, expert, always)
  assert.strictEqual(none.wtap, 0)
  assert.match(none.reason, /^Sin w-tap: te vas a \d+,\d$/)
  // Several ticks: plural
  const jr = { ...empty, kbFactor: 0.3, confidence: { ...empty.confidence, kb: 1 } }
  const many = t.planAfterHit({ sprintHit: false, distance: 2.9, cooldown: 13, enemyReadyIn: null }, jr, expert, always)
  assert.ok(many.wtap > 1)
  assert.match(many.reason, /^W-tap de \d+ ticks: /)
})

test('a running strafe keeps its reason, and standing still is not called a strafe', () => {
  const still = t.planStrafe({ tick: 10, enemyReadyIn: null }, empty, expert, never, { dir: null, until: 30, dodgedAt: -100 })
  assert.strictEqual(still.dir, null)
  assert.strictEqual(still.reason, 'Me quedo quieto')
  const moving = t.planStrafe({ tick: 10, enemyReadyIn: null }, empty, expert, never, { dir: 'left', until: 30, dodgedAt: -100 })
  assert.strictEqual(moving.reason, 'Strafe')
  const kept = t.planStrafe({ tick: 10, enemyReadyIn: null }, empty, expert, never, { dir: 'right', until: 30, dodgedAt: -100, reason: 'Strafe hacia el centro' })
  assert.strictEqual(kept.reason, 'Strafe hacia el centro')
})

test('the hold distance trusts the reach the rival really hits from, not its median', () => {
  // It usually hits close (median 2.6) but has landed hits from 3.0: holding at the median + margin
  // would stand inside its real reach
  const m = { ...empty, reach: { median: 2.6, p90: 3.0 }, confidence: { ...empty.confidence, reach: 1 } }
  const r = t.planSpacing({ distance: 3.0, untilReady: 10, enemyReadyIn: 8, style: 'sprint' }, m, expert)
  assert.strictEqual(r.back, true)
  assert.match(r.reason, /Me quedo a 3,4: llegas hasta 3,0/)
})

test('a low level plans the crit jump with noise but never before now', () => {
  const plan = t.planCrit({ untilReady: 9, distance: 3.2, closingSpeed: 0.05 }, { ...expert, planNoise: 2 }, never)
  assert.ok(plan === null || plan.jumpIn >= 0)
})

test('the rival reach is the farthest it usually hits from, or the vanilla 3.0 while unknown', () => {
  assert.strictEqual(t.enemyReachOf(empty), 3.0)
  assert.strictEqual(t.enemyReachOf({ ...empty, reach: { median: 2.6, p90: 2.95 } }), 2.95)
  assert.strictEqual(t.enemyReachOf({ ...empty, reach: { median: 2.9, p90: null } }), 2.9)
})

test('the anti-trade s-tap uses the same rival reach as the spacing (its p90, not its median)', () => {
  // It usually hits from 2.5 but reaches 3.0: at 2.9 we are inside its reach and its sword is first
  const m = { ...empty, reach: { median: 2.5, p90: 3.0 }, confidence: { ...empty.confidence, reach: 1 } }
  const r = t.planAfterHit({ sprintHit: true, distance: 2.9, cooldown: 13, enemyReadyIn: 4 }, m, expert, always)
  assert.ok(r.stap >= 2)
  assert.match(r.reason, /s-tap para no cambiar golpes/)
})

test('against a spam-clicker the expert stops holding back and trades charged hits, and says why', () => {
  const spammer = { ...empty, spamRate: 0.8, confidence: { ...empty.confidence, rhythm: 1 } }
  const r = t.planTrade(spammer, expert, always)
  assert.strictEqual(r.trade, true)
  assert.match(r.reason, /^Cambio golpes: spameas \(80 %\) y tus golpes pegan poco$/)
  // Not a spammer, not enough rhythm samples, or a level that does not trust the model this time
  assert.deepStrictEqual(t.planTrade({ ...spammer, spamRate: 0.3 }, expert, always), { trade: false, reason: '' })
  assert.strictEqual(t.planTrade({ ...spammer, confidence: { ...spammer.confidence, rhythm: 0.2 } }, expert, always).trade, false)
  assert.strictEqual(t.planTrade(empty, expert, always).trade, false)
  assert.strictEqual(t.planTrade(spammer, { ...expert, modelWeight: 0.5 }, () => 0.6).trade, false)
  assert.strictEqual(t.planTrade(spammer, { ...expert, modelWeight: 0.5 }, () => 0.4).trade, true)
})

test('while trading with a spam-clicker the after-hit plan keeps no s-tap to avoid trading', () => {
  // Same spot as the anti-trade s-tap above, but this recharge trades: no s-tap, and no reason that
  // contradicts "Cambio golpes"
  const m = { ...empty, reach: { median: 2.5, p90: 3.0 }, confidence: { ...empty.confidence, reach: 1 } }
  const ctx = { sprintHit: true, distance: 2.9, cooldown: 13, enemyReadyIn: 4 }
  const avoiding = t.planAfterHit(ctx, m, expert, always)
  assert.ok(avoiding.stap >= 2)
  const trading = t.planAfterHit({ ...ctx, trade: true }, m, expert, always)
  assert.strictEqual(trading.stap, 0)
  assert.strictEqual(trading.wtap, avoiding.wtap)
  assert.doesNotMatch(trading.reason, /no cambiar golpes/)
  assert.strictEqual(trading.reason, avoiding.reason.replace(' · s-tap para no cambiar golpes', ''))
})

test('in the air a charged hit goes now unless the crit fall is near and the rival stays in reach', () => {
  // Just jumped (the fall is 7 ticks away): a crit is not worth the wait, hit now
  assert.strictEqual(t.airSwing({ vy: 0.42, distance: 2.6, closingSpeed: 0, enemyReadyIn: 10 }).now, true)
  // The apex is a tick or two away, the rival stays, its sword is not ready: wait for the crit
  assert.strictEqual(t.airSwing({ vy: 0.05, distance: 2.6, closingSpeed: 0, enemyReadyIn: 10 }).now, false)
  // Same, but the rival is leaving the reach before the fall: hit now
  assert.strictEqual(t.airSwing({ vy: 0.05, distance: 2.9, closingSpeed: -0.25, enemyReadyIn: 10 }).now, true)
  // Same, but its sword is ready first: hit now, waiting gives it the first hit
  assert.strictEqual(t.airSwing({ vy: 0.05, distance: 2.6, closingSpeed: 0, enemyReadyIn: 0 }).now, true)
  // Falling: the crit is there
  const falling = t.airSwing({ vy: -0.1, distance: 2.6, closingSpeed: 0, enemyReadyIn: 10 })
  assert.strictEqual(falling.now, true)
  assert.match(falling.reason, /[Cc]rítico/)
})

test('a rival rushing in gets a sprint hit, the first hit of the trade wins', () => {
  const choice = t.chooseHitStyle({ distance: 3.6, closingSpeed: 0.2, comboFor: 0, comboAgainst: 0 }, empty, expert, always)
  assert.strictEqual(choice.style, 'sprint')
  assert.match(choice.reason, /primer golpe/)
})

test('in a jump made for the crit the bot waits for the whole fall, unless the rival leaves or hits first', () => {
  assert.strictEqual(t.airSwing({ vy: 0.35, distance: 2.6, closingSpeed: 0, enemyReadyIn: 10, critJump: true }).now, false)
  assert.strictEqual(t.airSwing({ vy: 0.35, distance: 2.9, closingSpeed: -0.2, enemyReadyIn: 10, critJump: true }).now, true)
  assert.strictEqual(t.airSwing({ vy: 0.35, distance: 2.6, closingSpeed: 0, enemyReadyIn: 2, critJump: true }).now, true)
})

test('against a rival that runs after its hits, the bot hits in the air at once', () => {
  assert.strictEqual(t.airSwing({ vy: 0.05, distance: 2.6, closingSpeed: 0, enemyReadyIn: 10, rivalRuns: true }).now, true)
  assert.strictEqual(t.airSwing({ vy: 0.05, distance: 2.6, closingSpeed: 0, enemyReadyIn: 10, rivalRuns: false }).now, false)
})

test('an owner that s-taps after most hits (from his inputs) counts as running after his hits', () => {
  const inputs = { stapRate: 0.7, confidence: { stapRate: 0.6 } }
  assert.strictEqual(t.rivalRuns({ ...empty, hitAndRun: null, inputs }, expert), true)
  assert.strictEqual(t.rivalRuns({ ...empty, hitAndRun: null, inputs: { stapRate: 0.2, confidence: { stapRate: 1 } } }, expert), false)
  assert.strictEqual(t.rivalRuns({ ...empty, hitAndRun: null, inputs: { stapRate: 0.7, confidence: { stapRate: 0.1 } } }, expert), false)
  assert.strictEqual(t.rivalRuns({ ...empty, hitAndRun: null }, expert), false)
})
