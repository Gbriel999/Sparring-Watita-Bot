'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { Arena } = require('./arena')
const { createWorld } = require('./world')

// A dumb engine: walks at the target, attacks every 13 ticks, toggling sprint as told
function dumbEngine (opts) {
  return (bot, hooks) => {
    let tick = 0
    let last = -100
    return {
      start () {},
      onHurt () {}, onSelfHurt () {}, onTargetHurt () {}, onTargetSwing () {},
      onPhysicsTick () {
        tick++
        const target = hooks.getTarget()
        const dx = target.position.x - bot.entity.position.x
        const dz = target.position.z - bot.entity.position.z
        bot.look(Math.atan2(-dx, -dz), 0, true)
        const d = Math.hypot(dx, dz)
        bot.setControlState('forward', d > 2.5)
        bot.setControlState('sprint', opts.sprintAlways || (opts.wtap ? tick % 13 !== 1 : false))
        bot.setControlState('jump', Boolean(opts.jumpAt && tick % 13 === opts.jumpAt))
        if (tick - last >= 13 && d < 3.0) { bot.attack(target); last = tick }
      }
    }
  }
}

test('the world has a platform floor and void around it', () => {
  const w = createWorld({ platform: { minX: -3, maxX: 3, minZ: -3, maxZ: 3 } })
  assert.strictEqual(w.blockAt(0, -1, 0).boundingBox, 'block')
  assert.strictEqual(w.blockAt(10, -1, 0).boundingBox, 'empty')
})

test('without re-pressing sprint only the first sprint hit of each round counts as a sprint hit', () => {
  // A round reset (death or fall) releases every key, so the press after it is a real re-press:
  // at most one real sprint hit per round, while the held key keeps attempting more
  const m = new Arena({ seed: 1, rival: 'tanque', ticks: 400, engineFactory: dumbEngine({ sprintAlways: true }) }).run()
  const rounds = 1 + m.kills + m.deaths + m.edgeFalls
  assert.ok(m.sprintAttempts > rounds + 3, `${m.sprintAttempts} attempts in ${rounds} rounds`)
  assert.ok(m.sprintHitsReal <= rounds, `${m.sprintHitsReal} real sprint hits in ${rounds} rounds`)
})

test('a 1-tick sprint release before each hit makes every sprint hit real', () => {
  const m = new Arena({ seed: 1, rival: 'tanque', ticks: 400, engineFactory: dumbEngine({ wtap: true }) }).run()
  assert.ok(m.sprintAttempts > 3)
  assert.ok(m.sprintHitsReal / m.sprintAttempts > 0.9)
})

test('the sim counts damage, hits and reach the same way for every run with the same seed', () => {
  const a = new Arena({ seed: 7, rival: 'strafer', ticks: 600, engineFactory: dumbEngine({ wtap: true }) }).run()
  const b = new Arena({ seed: 7, rival: 'strafer', ticks: 600, engineFactory: dumbEngine({ wtap: true }) }).run()
  assert.deepStrictEqual(a, b)
  assert.ok(a.maxHitDistance <= 3.0)
})

test('walking off a platform is counted as an edge fall', () => {
  const runner = () => (bot) => ({ start () {}, onHurt () {}, onSelfHurt () {}, onTargetHurt () {}, onTargetSwing () {},
    onPhysicsTick () { bot.look(Math.PI / 2, 0, true); bot.setControlState('forward', true) } })
  const m = new Arena({ seed: 1, rival: 'kiter', ticks: 200, platform: { minX: -3, maxX: 3, minZ: -3, maxZ: 3 }, engineFactory: runner() }).run()
  assert.ok(m.edgeFalls >= 1)
})

// ---- Rules of the arena, one by one ------------------------------------------------------------
// The tests below drive the arena with a scripted engine and a rival that stands still, and push the
// rival to a chosen spot (arena.rival.entity.position) so every number can be worked out by hand.

const { jumpArc, PHYS } = require('../brain/physics')
const { anglesTo } = require('../combat')
const { seeded } = require('./rng')
const { createRival } = require('./rivals')

const NOOP_ENGINE = { start () {}, onHurt () {}, onSelfHurt () {}, onTargetHurt () {}, onTargetSwing () {} }
// An engine that runs `script(tick, bot, hooks)` once per physics tick
const scripted = (script) => (bot, hooks) => {
  let tick = 0
  return { ...NOOP_ENGINE, onPhysicsTick () { tick++; script(tick, bot, hooks) } }
}
// A rival that stands still facing -Z and never attacks
const statue = () => ({ decide: () => ({ controls: {}, attack: false, look: { yaw: 0, pitch: 0 } }), onHurt () {} })
// Crosshair on the center of the rival's body
function aimAt (bot, target) {
  const { yaw, pitch } = anglesTo(bot.entity.position.offset(0, 1.62, 0), target.position.offset(0, 0.9, 0))
  return bot.look(yaw, pitch, true)
}
function arenaWith (script, { rivalZ = 2.0, rival = statue(), ...rest } = {}) {
  const arena = new Arena({ seed: 1, rival, engineFactory: scripted(script), ticks: 100, ...rest })
  arena.rival.entity.position.z = rivalZ
  return arena
}
// Steps the arena keeping the rival where it was put: knockback would carry it out of reach otherwise
function stepPinned (arena, ticks) {
  const { x, y, z } = arena.rival.entity.position
  for (let i = 0; i < ticks; i++) {
    arena.rival.entity.position.set(x, y, z)
    arena.rival.entity.velocity.set(0, 0, 0)
    arena.rival.entity.onGround = true
    arena.step()
  }
}
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message || ''} ${actual} vs ${expected}`)

test('a charged hit on the ground deals 7, counts its distance and pushes 0.4 back', () => {
  const arena = arenaWith((tick, bot, hooks) => {
    aimAt(bot, hooks.getTarget())
    if (tick === 1) bot.attack(hooks.getTarget())
  })
  arena.step()
  const m = arena.metrics()
  near(m.damageDealt, 7)
  assert.strictEqual(m.hitsLanded, 1)
  assert.strictEqual(m.critsLanded, 0)
  assert.strictEqual(m.sprintHitsReal, 0)
  // Eye to box: the rival is at z = 2.0, so its box starts at 1.7 and the eyes are level with its box
  near(m.maxHitDistance, 1.7)
  assert.strictEqual(m.avgHitDistance, 1.7)
  // Knockback 0.4 along +Z, pushed in the very tick of the hit (ground friction)
  near(arena.rival.entity.position.z, 2.4)
  assert.strictEqual(arena.rival.health, 13)
})

test('a sprint hit pushes 0.7 and a jump reset cuts the push to 0.6 of that', () => {
  // Sprint pressed on tick 1, the attack on tick 2: the server already holds the sprint flag
  const sprintHit = (rival) => {
    const arena = arenaWith((tick, bot, hooks) => {
      aimAt(bot, hooks.getTarget())
      if (tick === 1) bot.setControlState('sprint', true)
      if (tick === 2) bot.attack(hooks.getTarget())
    }, { rival })
    arena.step()
    arena.step()
    return arena
  }
  const plain = sprintHit(statue())
  near(plain.rival.entity.position.z, 2.7)
  assert.strictEqual(plain.metrics().sprintHitsReal, 1)
  assert.strictEqual(plain.metrics().packetOrderViolations, 0)
  // The resetter presses jump in the tick the hit lands, on the ground: its first move after it is the jump
  const resetter = { decide: (self, bot, tick) => ({ controls: { jump: tick === 2 }, attack: false, look: { yaw: 0, pitch: 0 } }), onHurt () {} }
  near(sprintHit(resetter).rival.entity.position.z, 2.0 + 0.7 * PHYS.JUMP_RESET_FACTOR)
})

test('a sprint toggle in the tick of an attack is a packet order violation and the hit keeps the old flag', () => {
  // Vanilla sends the attack before the sprint change of the same tick, so the server attacks with the
  // flag it had; mineflayer would send them the other way round (Grim's PacketOrderF)
  const arena = arenaWith((tick, bot, hooks) => {
    aimAt(bot, hooks.getTarget())
    if (tick === 1) { bot.setControlState('sprint', true); bot.attack(hooks.getTarget()) }
  })
  arena.step()
  const m = arena.metrics()
  assert.strictEqual(m.packetOrderViolations, 1)
  assert.strictEqual(m.hitsLanded, 1)
  assert.strictEqual(m.sprintAttempts, 0)
  assert.strictEqual(m.sprintHitsReal, 0)
  near(arena.rival.entity.position.z, 2.4)
})

test('the bot moves first and its attack is checked from where the server last saw it', () => {
  // Rival box 3.2 away from the start: the bot's own move this tick brings it within 3.0, but the
  // attack packet goes out before that move's position packet
  // The script swings only when it sees itself in reach, like an engine does
  const { reachDistance } = require('./world')
  const arena = arenaWith((tick, bot, hooks) => {
    const target = hooks.getTarget()
    aimAt(bot, target)
    if (tick === 2 && reachDistance(bot.entity.position, target.position) <= 3.0) bot.attack(target)
  }, { rivalZ: 3.5 })
  arena.step()
  arena.self.entity.velocity.set(0, 0, 0.4)
  arena.step()
  assert.ok(arena.self.entity.position.z > 0.3, 'the bot moved before deciding')
  const m = arena.metrics()
  assert.strictEqual(m.outOfReachAttempts, 1)
  assert.strictEqual(m.hitsLanded, 0)
})

test('a jump pressed while the knockback is pending is a jump reset for the bot too', () => {
  // The rival hits the bot from +Z on tick 1; an engine that presses jump in onHurt (as the real one
  // does from the velocity packet) jumps on its next move and keeps 0.6 of the push
  const rivalHit = { decide: (self, bot, tick) => ({ controls: {}, attack: tick === 1, look: { yaw: 0, pitch: 0 } }), onHurt () {} }
  const pushed = (jumps) => {
    const factory = (bot) => ({ ...NOOP_ENGINE, onPhysicsTick () {}, onHurt () { if (jumps) bot.setControlState('jump', true) } })
    const arena = new Arena({ seed: 1, rival: rivalHit, engineFactory: factory, ticks: 10 })
    arena.rival.entity.position.z = 2.0
    arena.step()
    arena.step()
    return arena.self.entity.position.z
  }
  near(pushed(false), -0.4)
  near(pushed(true), -0.4 * PHYS.JUMP_RESET_FACTOR)
})

test('the sprint flag is spent by a sprint hit', () => {
  const arena = arenaWith((tick, bot, hooks) => {
    aimAt(bot, hooks.getTarget())
    if (tick === 1) bot.setControlState('sprint', true)
    if (tick === 2 || tick === 15) bot.attack(hooks.getTarget())
  })
  arena.rival.health = 1000
  stepPinned(arena, 15)
  const m = arena.metrics()
  assert.strictEqual(m.hitsLanded, 2)
  assert.strictEqual(m.sprintAttempts, 2)
  assert.strictEqual(m.sprintHitsReal, 1)
})

test('an attack is a crit only when falling, charged and not sprinting', () => {
  // Jump pressed on tick 1 is applied by the move of tick 2 (the bot moves before it decides). The
  // server judges an attack by the last move it received: the first downward one is arc tick 7 (move
  // of tick 8), so the attack of tick 9 is the first crit and the one of tick 8 is not
  const hitAt = (attackTick, sprint) => {
    const arena = arenaWith((tick, bot, hooks) => {
      aimAt(bot, hooks.getTarget())
      bot.setControlState('jump', tick === 1)
      bot.setControlState('sprint', sprint)
      if (tick === attackTick) bot.attack(hooks.getTarget())
    })
    arena.rival.health = 1000
    for (let i = 0; i < attackTick; i++) arena.step()
    return arena.metrics()
  }
  const falling = hitAt(9, false)
  assert.strictEqual(falling.critsLanded, 1)
  assert.strictEqual(falling.critAttempts, 1)
  near(falling.damageDealt, 7 * 1.5)
  const rising = hitAt(8, false)
  assert.strictEqual(rising.hitsLanded, 1)
  assert.strictEqual(rising.critsLanded, 0)
  assert.strictEqual(rising.critAttempts, 1)
  near(rising.damageDealt, 7)
  // Sprint flag up since the first tick: no crit even while falling
  const sprinting = hitAt(9, true)
  assert.strictEqual(sprinting.hitsLanded, 1)
  assert.strictEqual(sprinting.critsLanded, 0)
})

test('damage follows the 1.9+ charge and a swing in the air resets it', () => {
  const damageAfter = (script) => {
    const arena = arenaWith((tick, bot, hooks) => { aimAt(bot, hooks.getTarget()); script(tick, bot, hooks.getTarget()) })
    arena.rival.health = 1000
    stepPinned(arena, 40)
    return arena.metrics().damageDealt
  }
  // 12 ticks after the last swing the charge is (12 + 0.5) / 12.5 = 1
  near(damageAfter((tick, bot, target) => { if (tick === 5 || tick === 17) bot.attack(target) }), 14)
  // 11 ticks after the last swing (the target is hurtable again): 7 * (0.2 + 0.8 * 0.92^2)
  const charge = 11.5 / 12.5
  near(damageAfter((tick, bot, target) => { if (tick === 5 || tick === 16) bot.attack(target) }), 7 + 7 * (0.2 + 0.8 * charge * charge))
  // Swinging at the air at tick 15 restarts the charge: the hit at 17 only has 2 ticks of it
  const reset = 2.5 / 12.5
  near(damageAfter((tick, bot, target) => {
    if (tick === 5) bot.attack(target)
    if (tick === 15) bot.swingArm('right')
    if (tick === 17) bot.attack(target)
  }), 7 + 7 * (0.2 + 0.8 * reset * reset))
})

test('the target cannot be hurt again for 10 ticks', () => {
  const hitsWhenAttackingAt = (ticks) => {
    const arena = arenaWith((tick, bot, hooks) => { aimAt(bot, hooks.getTarget()); if (ticks.includes(tick)) bot.attack(hooks.getTarget()) })
    arena.rival.health = 1000
    stepPinned(arena, 40)
    return arena.metrics().hitsLanded
  }
  assert.strictEqual(hitsWhenAttackingAt([5, 14]), 1) // 9 ticks later: still invulnerable
  assert.strictEqual(hitsWhenAttackingAt([5, 15]), 2) // 10 ticks later: hurt again
})

test('attacks that miss are counted apart and never land', () => {
  // Rival too far: its box is 3.1 away from the eye
  const far = arenaWith((tick, bot, hooks) => { aimAt(bot, hooks.getTarget()); if (tick === 1) bot.attack(hooks.getTarget()) }, { rivalZ: 3.4 })
  far.step()
  assert.strictEqual(far.metrics().outOfReachAttempts, 1)
  assert.strictEqual(far.metrics().hitsLanded, 0)
  // In reach but looking the other way
  const blind = arenaWith((tick, bot, hooks) => { bot.look(0, 0, true); if (tick === 1) bot.attack(hooks.getTarget()) })
  blind.step()
  assert.strictEqual(blind.metrics().blindAttacks, 1)
  assert.strictEqual(blind.metrics().hitsLanded, 0)
  assert.strictEqual(blind.metrics().damageDealt, 0)
  // Looking above the rival's head while standing on the ground is blind too: the box ends at 1.8
  const high = arenaWith((tick, bot, hooks) => { bot.look(Math.PI, 0.5, true); if (tick === 1) bot.attack(hooks.getTarget()) })
  high.step()
  assert.strictEqual(high.metrics().blindAttacks, 1)
  // A miss is not an attempt at a crit or a sprint hit
  assert.strictEqual(high.metrics().sprintAttempts, 0)
})

test('a shield stops damage and knockback from the front only', () => {
  const rivalHit = { decide: () => ({ controls: {}, attack: true, look: { yaw: 0, pitch: 0 } }), onHurt () {} }
  // Two ticks: the knockback of tick 1 moves the bot at the start of tick 2 (it moves before deciding)
  const duel = (botYaw) => {
    const arena = arenaWith((tick, bot) => { bot.look(botYaw, 0, true); bot.activateItem(true) }, { rival: rivalHit })
    arena.step()
    arena.step()
    return arena
  }
  const front = duel(Math.PI) // the bot looks at +Z, where the rival stands
  assert.strictEqual(front.metrics().hitsTaken, 0)
  assert.strictEqual(front.metrics().damageTaken, 0)
  assert.strictEqual(front.self.entity.position.z, 0)
  const back = duel(0) // the bot looks to -Z: the rival hits it in the back
  assert.strictEqual(back.metrics().hitsTaken, 1)
  near(back.metrics().damageTaken, 7)
  near(back.self.entity.position.z, -0.4)
})

test('the engine hears about the hits it takes and lands, and about the rival swings', () => {
  const calls = []
  const rivalHit = { decide: (self, bot, tick) => ({ controls: {}, attack: tick === 1, look: { yaw: 0, pitch: 0 } }), onHurt () {} }
  const factory = (bot, hooks) => ({
    start (mode) { calls.push(`start:${mode}`) },
    onHurt () { calls.push('hurt') },
    onSelfHurt (info) { calls.push(`selfHurt:${info.byTarget}`) },
    onTargetHurt () { calls.push('targetHurt') },
    onTargetSwing () { calls.push('targetSwing') },
    onPhysicsTick () {
      calls.push(`tick:${hooks.now()}`)
      aimAt(bot, hooks.getTarget())
      bot.attack(hooks.getTarget())
    }
  })
  const arena = new Arena({ seed: 1, rival: rivalHit, engineFactory: factory, ticks: 1 })
  arena.rival.entity.position.z = 2.0
  arena.run()
  assert.deepStrictEqual(calls, ['start:pelea', 'tick:50', 'targetHurt', 'targetSwing', 'hurt', 'selfHurt:true'])
})

test('a death counts a kill and puts both fighters back at their start', () => {
  const arena = arenaWith((tick, bot, hooks) => { aimAt(bot, hooks.getTarget()); if (tick === 1) bot.attack(hooks.getTarget()) })
  arena.rival.health = 5
  arena.step()
  const m = arena.metrics()
  assert.strictEqual(m.kills, 1)
  assert.strictEqual(m.deaths, 0)
  assert.strictEqual(arena.rival.health, 20)
  assert.deepStrictEqual(arena.rival.entity.position.toArray(), [0, 0, 4])
  assert.deepStrictEqual(arena.self.entity.position.toArray(), [0, 0, 0])
  assert.strictEqual(arena.self.entity.yaw, Math.PI)
})

test('a round reset (death or fall) releases every key of whoever starts over, like a client after a respawn', () => {
  const CONTROLS = ['forward', 'back', 'left', 'right', 'jump', 'sprint', 'sneak']
  const HELD = { forward: true, back: false, left: true, right: false, jump: true, sprint: true, sneak: true }
  const pressAll = (bot) => { for (const [control, value] of Object.entries(HELD)) bot.setControlState(control, value) }
  const presser = () => ({ decide: () => ({ controls: { ...HELD }, attack: false, look: { yaw: 0, pitch: 0 } }), onHurt () {} })
  const released = (fighter, label) => {
    for (const control of CONTROLS) assert.strictEqual(fighter.controlState[control], false, `${label}: ${control} still held`)
    assert.strictEqual(fighter.serverSprinting, false, `${label}: still sprinting for the server`)
  }
  // A kill: both fighters start a new round
  const kill = arenaWith((tick, bot, hooks) => { aimAt(bot, hooks.getTarget()); pressAll(bot); if (tick === 1) bot.attack(hooks.getTarget()) }, { rival: presser() })
  kill.rival.health = 5
  kill.step()
  assert.strictEqual(kill.metrics().kills, 1)
  released(kill.self, 'bot after a kill')
  released(kill.rival, 'rival after a kill')
  // The bot runs off the platform holding every key: it starts over with none held
  const platform = { minX: -3, maxX: 3, minZ: -3, maxZ: 3 }
  const fall = arenaWith((tick, bot) => { bot.look(Math.PI / 2, 0, true); pressAll(bot) }, { rival: presser(), platform })
  while (fall.metrics().edgeFalls === 0 && fall.tick < 200) fall.step()
  assert.strictEqual(fall.metrics().edgeFalls, 1)
  released(fall.self, 'bot after its fall')
  // The rival drops into the void holding every key: it starts over with none held
  const drop = arenaWith(() => {}, { rival: presser(), platform })
  drop.rival.entity.position.set(10, -19.5, 10)
  drop.rival.entity.velocity.set(0, -1, 0)
  drop.rival.entity.onGround = false
  drop.step()
  assert.strictEqual(drop.rivalEdgeFalls, 1)
  released(drop.rival, 'rival after its fall')
})

test('walking and sprinting settle at the vanilla speeds', () => {
  const speedOf = (sprint) => {
    const arena = arenaWith((tick, bot) => { bot.look(Math.PI, 0, true); bot.setControlState('forward', true); bot.setControlState('sprint', sprint) })
    for (let i = 0; i < 59; i++) arena.step()
    const before = arena.self.entity.position.z
    arena.step()
    return arena.self.entity.position.z - before
  }
  assert.ok(Math.abs(speedOf(false) - PHYS.WALK_SPEED) < 1e-3, `walk ${speedOf(false)}`)
  assert.ok(Math.abs(speedOf(true) - PHYS.SPRINT_SPEED) < 1e-3, `sprint ${speedOf(true)}`)
})

test('a jump follows the arc of the physics module and lands on the platform', () => {
  const arena = arenaWith((tick, bot) => bot.setControlState('jump', tick === 1), { platform: { minX: -3, maxX: 3, minZ: -3, maxZ: 3 } })
  // The jump pressed on tick 1 is applied by the move of tick 2
  arena.step()
  near(arena.self.entity.position.y, 0)
  for (const step of jumpArc()) {
    arena.step()
    near(arena.self.entity.position.y, step.y, `tick ${step.tick}`)
  }
  assert.strictEqual(arena.self.entity.onGround, true)
  assert.strictEqual(arena.self.entity.velocity.y, 0)
})

test('createRival rejects unknown kinds and every kind is deterministic', () => {
  assert.throws(() => createRival('nope', seeded(1)), /unknown rival kind/)
  for (const kind of ['tanque', 'jumpResetter', 'strafer', 'kiter']) {
    const run = () => new Arena({ seed: 5, rival: kind, ticks: 300, engineFactory: scripted(() => {}) }).run()
    assert.deepStrictEqual(run(), run(), kind)
  }
})

test('the rival is judged fairly: its swing and its view of the bot use where the server last saw the bot', () => {
  // The bot starts with its box 3.2 away from the rival (out of reach) and is pushed in by its own move
  // of tick 2. A rival that swings blindly on tick 2 misses: the server still has the bot at the start
  const seen = []
  const swinger = {
    decide: (self, bot, tick) => {
      seen.push(bot.entity.position.z)
      return { controls: {}, attack: tick === 2, look: { yaw: 0, pitch: 0 } }
    },
    onHurt () {}
  }
  const arena = arenaWith(() => {}, { rivalZ: 3.5, rival: swinger })
  arena.step()
  arena.self.entity.velocity.set(0, 0, 0.4)
  arena.step()
  assert.ok(arena.self.entity.position.z > 0.3, 'the bot moved in on tick 2')
  assert.strictEqual(arena.metrics().hitsTaken, 0)
  // The rival script saw the bot where the server had it, not where the bot already was
  near(seen[1], 0)
  // And the other way round: the bot steps back out of reach on its move, the server still has it in
  const back = arenaWith(() => {}, { rivalZ: 3.1, rival: swinger })
  back.step()
  back.self.entity.velocity.set(0, 0, -0.4)
  back.step()
  assert.ok(back.self.entity.position.z < -0.3, 'the bot moved away on tick 2')
  assert.strictEqual(back.metrics().hitsTaken, 1)
})
