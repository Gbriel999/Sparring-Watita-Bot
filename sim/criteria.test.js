'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { runDuel } = require('./arena')
const { CombatEngine } = require('../combat')

const engineFactory = (bot, hooks) => {
  const engine = new CombatEngine(bot, { getTarget: hooks.getTarget, shieldAllowed: () => true, paused: () => false, now: hooks.now, rng: hooks.rng })
  engine.level = hooks.level
  return engine
}
const duel = (level, rival, seed, extra = {}) => runDuel({ level, rival, seed, ticks: 2400, engineFactory, ...extra })
const RIVALS = ['tanque', 'jumpResetter', 'strafer', 'kiter']

test('crits land when the expert goes for them', () => {
  const m = duel('experto', 'jumpResetter', 1)
  assert.ok(m.critAttempts >= 10, `critAttempts=${m.critAttempts}`)
  assert.ok(m.critsLanded / m.critAttempts >= 0.7, `${m.critsLanded}/${m.critAttempts}`)
})

// The live fights against the owner: a rusher with ~155 ms of ping, seen every 2 ticks and late. The
// engine lost them 7-0 before the rival's ground state, the air hits and the hit-and-run read existed.
test('with server lag the expert beats a rusher that hits from 3.3 (the owner as the live fights showed him)', () => {
  let dealt = 0
  let taken = 0
  for (const seed of [1, 2, 3, 4]) {
    const m = duel('experto', 'presionador', seed, { rivalFeed: true })
    dealt += m.damageDealt
    taken += m.damageTaken
  }
  assert.ok(dealt > taken * 1.05, `dealt ${dealt.toFixed(0)} taken ${taken.toFixed(0)}`)
})

test('with server lag the expert reads a hit-and-run rival and hits it in the air before it leaves', () => {
  let dealt = 0
  let taken = 0
  for (const seed of [1, 2, 3, 4]) {
    const m = duel('experto', 'kiter', seed, { rivalFeed: true })
    dealt += m.damageDealt
    taken += m.damageTaken
  }
  // The engine without the read did 0.28 of the damage it took
  assert.ok(dealt / taken >= 0.55, `dealt/taken ${(dealt / taken).toFixed(2)}`)
})

test('sprint hits are real: the w-tap always re-arms the sprint', () => {
  for (const level of ['normal', 'experto']) {
    const m = duel(level, 'strafer', 2)
    assert.ok(m.sprintAttempts >= 10, `${level} sprintAttempts=${m.sprintAttempts}`)
    assert.ok(m.sprintHitsReal / m.sprintAttempts >= 0.9, `${level} ${m.sprintHitsReal}/${m.sprintAttempts}`)
  }
})

// Lowest average hit distance per rival. The tanque sprints in at 0.28 b/tick and a bot can only walk
// backwards at 0.2159 b/tick, so it cannot be kept at the 2.6 the others allow: it always closes in
// (controller ruling, fix round 3). Against a spam-rusher like it the best play is close, charged
// trading (crits from the knockback hop after its weak hits), not spacing: in round 3 that took the
// expert to 7.45 against normal's 5.35 dealt/taken over seeds 11-13, and it pins the mean hit distance
// at about 1.9. So its bar is only a sanity check that the bot is not stuck inside the rival
// (controller ruling, fix round 4). The other rivals keep 2.6.
const MIN_HIT_DISTANCE = { tanque: 1.8, jumpResetter: 2.6, strafer: 2.6, kiter: 2.6 }

test('the expert hits from its hit distance, never beyond reach, never blind', () => {
  for (const rival of RIVALS) {
    const m = duel('experto', rival, 3)
    assert.ok(m.avgHitDistance >= MIN_HIT_DISTANCE[rival] && m.avgHitDistance <= 3.0, `${rival} avg=${m.avgHitDistance}`)
    assert.ok(m.maxHitDistance <= 3.0)
    assert.strictEqual(m.outOfReachAttempts, 0)
    assert.strictEqual(m.blindAttacks, 0)
  }
})

test('the expert trades better than normal against every scripted rival', () => {
  for (const rival of RIVALS) {
    let expert = 0
    let normal = 0
    for (const seed of [11, 12, 13]) {
      const e = duel('experto', rival, seed)
      const n = duel('normal', rival, seed)
      expert += e.damageDealt / Math.max(1, e.damageTaken)
      normal += n.damageDealt / Math.max(1, n.damageTaken)
    }
    assert.ok(expert > normal, `${rival}: experto ${expert.toFixed(2)} vs normal ${normal.toFixed(2)}`)
  }
})

test('it never falls off a platform', () => {
  for (const rival of ['tanque', 'kiter']) {
    for (const level of ['normal', 'experto']) {
      const m = duel(level, rival, 5, { platform: { minX: -4, maxX: 4, minZ: -4, maxZ: 4 } })
      assert.strictEqual(m.edgeFalls, 0, `${level} vs ${rival}`)
    }
  }
})

test('the packets go out in vanilla order: never a sprint toggle in the tick of an attack', () => {
  for (const rival of RIVALS) {
    for (const level of ['normal', 'experto']) {
      const m = duel(level, rival, 3)
      assert.strictEqual(m.packetOrderViolations, 0, `${level} vs ${rival}`)
    }
  }
})

// ---- Engine contract in the arena (not criteria, but what the criteria rely on) ----------------

const { Arena } = require('./arena')
const { reachDistance } = require('./world')

test('a duel never reads the wall clock or Math.random: the seed decides everything', () => {
  const realNow = Date.now
  const realRandom = Math.random
  Date.now = () => { throw new Error('Date.now called') }
  Math.random = () => { throw new Error('Math.random called') }
  try {
    const a = duel('experto', 'strafer', 7)
    const b = duel('experto', 'strafer', 7)
    assert.deepStrictEqual(a, b)
  } finally {
    Date.now = realNow
    Math.random = realRandom
  }
})

test('the panel hears crit and sprint only for the real ones', () => {
  for (const [level, rival] of [['experto', 'jumpResetter'], ['normal', 'strafer'], ['facil', 'tanque']]) {
    const kinds = { crit: 0, sprint: 0, hit: 0, air: 0 }
    const factory = (bot, hooks) => {
      const engine = new CombatEngine(bot, {
        getTarget: hooks.getTarget, shieldAllowed: () => true, paused: () => false, now: hooks.now, rng: hooks.rng,
        onAttack: (kind) => { kinds[kind]++ }
      })
      engine.level = hooks.level
      return engine
    }
    const m = new Arena({ seed: 4, rival, level, ticks: 1200, engineFactory: factory }).run()
    assert.strictEqual(kinds.crit, m.critsLanded, `${level} crits`)
    assert.strictEqual(kinds.sprint, m.sprintHitsReal, `${level} sprint hits`)
    assert.strictEqual(kinds.crit + kinds.sprint + kinds.hit, m.hitsLanded, `${level} hits`)
  }
})

test('the rival reading has a name, a fight count, the summary and at most 4 reasons', () => {
  const arena = new Arena({ seed: 2, rival: 'strafer', level: 'experto', ticks: 400, engineFactory })
  arena.run()
  const reading = arena.engine.rivalSummary()
  assert.deepStrictEqual(Object.keys(reading).sort(), ['fights', 'name', 'plan', 'summary'])
  assert.strictEqual(reading.summary.samples > 0, true)
  assert.ok(reading.plan.length >= 1 && reading.plan.length <= 4, `plan ${reading.plan}`)
  assert.strictEqual(new Set(reading.plan).size, reading.plan.length)
  for (const reason of reading.plan) assert.ok(typeof reason === 'string' && reason.length > 0)
})

test('the rival memory is loaded on start, saved every 600 ticks and at the end of the fight', () => {
  const calls = []
  const memory = {
    load: (name) => { calls.push(`load:${name}`); return new (require('../brain/opponent').OpponentModel)() },
    info: () => ({ fights: 2, savedAt: null }),
    save: (name, model, { fightEnded }) => { calls.push(`save:${name}:${fightEnded}`); return true },
    forget: (name) => { calls.push(`forget:${name}`); return true }
  }
  const factory = (bot, hooks) => {
    const engine = new CombatEngine(bot, {
      getTarget: hooks.getTarget, shieldAllowed: () => true, paused: () => false, now: hooks.now, rng: hooks.rng,
      memory, opponentName: () => 'Rival'
    })
    engine.level = hooks.level
    return engine
  }
  const arena = new Arena({ seed: 1, rival: 'kiter', level: 'normal', ticks: 650, engineFactory: factory })
  arena.run()
  assert.strictEqual(arena.engine.rivalSummary().fights, 2)
  arena.engine.stop()
  assert.deepStrictEqual(calls, ['load:Rival', 'save:Rival:false', 'save:Rival:true'])
  assert.strictEqual(arena.engine.rivalSummary().fights, 3)
  arena.engine.forgetOpponent()
  assert.strictEqual(calls[calls.length - 1], 'forget:Rival')
  assert.strictEqual(arena.engine.rivalSummary().fights, 0)
})

test('a hurt far from the rival (fall, fire, lava on 1.20+) does not teach its reach', () => {
  const arena = new Arena({ seed: 1, rival: 'kiter', level: 'experto', ticks: 60, engineFactory })
  arena.run()
  const engine = arena.engine
  const before = engine.model.hitsTaken
  const combo = engine.comboAgainst
  const bot = arena.self.entity.position
  arena.rival.entity.position.set(bot.x, 0, bot.z + 6)
  engine.onSelfHurt({ byTarget: true })
  assert.strictEqual(engine.model.hitsTaken, before, 'six blocks away: not its hit')
  assert.strictEqual(engine.comboAgainst, combo + 1, 'the combo counter still moves')
  arena.rival.entity.position.set(bot.x, 0, bot.z + 3)
  engine.onSelfHurt({ byTarget: true })
  assert.strictEqual(engine.model.hitsTaken, before + 1, 'three blocks away: its hit')
})

test('the rival crits come from the server crit effect, whichever arrives first', () => {
  const arena = new Arena({ seed: 1, rival: 'kiter', level: 'experto', ticks: 60, engineFactory })
  arena.run()
  const engine = arena.engine
  const bot = arena.self.entity.position
  arena.rival.entity.position.set(bot.x, 0, bot.z + 3)
  const crits = engine.model.crits
  // Effect after the hurt (the vanilla order)
  engine.onSelfHurt({ byTarget: true })
  engine.onCritTaken()
  assert.strictEqual(engine.model.crits, crits + 1)
  // Effect first, the hurt in the same tick
  engine.tick += 20
  engine.onCritTaken()
  engine.onSelfHurt({ byTarget: true })
  assert.strictEqual(engine.model.crits, crits + 2)
  // An effect with no hit of the rival near it counts nothing
  engine.tick += 20
  engine.onCritTaken()
  engine.tick += 20
  engine.onSelfHurt({ byTarget: true })
  assert.strictEqual(engine.model.crits, crits + 2)
})

test("the engine's jump reset: a jump pressed in onHurt is the next move and keeps 0.6 of the push", () => {
  // The rival hits the bot from +Z on tick 1; the engine (target hidden, so it presses nothing else)
  // rolls its jump reset in onHurt. Never while paused (eating): the key would stay held.
  const rivalHit = { decide: (self, bot, tick) => ({ controls: {}, attack: tick === 1, look: { yaw: 0, pitch: 0 } }), onHurt () {} }
  const pushed = ({ roll, paused = false }) => {
    const factory = (bot, hooks) => {
      const engine = new CombatEngine(bot, {
        getTarget: () => ({ ...hooks.getTarget(), isValid: false }), shieldAllowed: () => true,
        paused: () => paused, now: hooks.now, rng: () => roll
      })
      engine.level = 'experto'
      return engine
    }
    const arena = new Arena({ seed: 1, rival: rivalHit, engineFactory: factory, ticks: 10, level: 'experto' })
    arena.rival.entity.position.z = 2.0
    arena.step()
    arena.step()
    return { z: arena.self.entity.position.z, jumpHeld: arena.self.controlState.jump }
  }
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`)
  close(pushed({ roll: 0 }).z, -0.4 * 0.6)
  close(pushed({ roll: 0.99 }).z, -0.4)
  const eating = pushed({ roll: 0, paused: true })
  close(eating.z, -0.4)
  assert.strictEqual(eating.jumpHeld, false)
})

test('a hopping or jittering rival 4 to 8 blocks away is not waited for: the bot walks in', () => {
  const hopper = { decide: () => ({ controls: { jump: true }, attack: false, look: { yaw: 0, pitch: 0 } }), onHurt () {} }
  const jitter = { decide: (self, bot, tick) => ({ controls: { forward: tick % 2 === 0, back: tick % 2 === 1 }, attack: false, look: { yaw: 0, pitch: 0 } }), onHurt () {} }
  // Judged up to the bot's first landed hit (final review): after it the rival flies off on the
  // knockback, and waiting for a knockback flight is wanted. The bot reaches a hopper sooner than it used
  // to (its own steps no longer read as the rival approaching), so at tick 40 that flight is still on.
  // Also with server-like updates of the rival (every 2 ticks, 1 to 3 ticks late)
  for (const rivalFeed of [null, true]) {
    for (const [name, rival] of [['hopper', hopper], ['jitter', jitter]]) {
      const label = `${name}${rivalFeed ? ' (server updates)' : ''}`
      const arena = new Arena({ seed: 1, rival, level: 'experto', ticks: 40, engineFactory, rivalFeed })
      arena.rival.entity.position.z = 7
      if (arena.rivalView !== arena.rival.entity) arena.rivalView.position.z = 7
      let waited = 0
      while (arena.tick < arena.ticks && arena.stats.hitsLanded === 0) {
        arena.step()
        if (arena.stats.hitsLanded === 0 && arena.engine.plan.some((reason) => reason.startsWith('Te espero'))) waited++
      }
      const gap = arena.rival.entity.position.z - arena.self.entity.position.z
      assert.strictEqual(waited, 0, `${label}: waited ${waited} ticks for a rival that is not coming`)
      assert.ok(gap < 4.5, `${label}: gap ${gap.toFixed(2)}`)
    }
  }
})

test('the wait for a rival that comes back lasts at most 20 ticks, and a jitter is not an approach', () => {
  const engine = new Arena({ seed: 1, rival: 'kiter', level: 'experto', ticks: 1, engineFactory }).engine
  const standing = { onGround: true }
  engine.closingLog = [0.2, 0.2, 0.2, 0.2]
  let waited = 0
  for (let i = 0; i < 30; i++) {
    engine.tick++
    if (engine.waitFor(standing)) waited++
  }
  assert.strictEqual(waited, 20)
  engine.closingLog = [0.2, -0.2, 0.2, -0.2]
  assert.strictEqual(engine.waitFor(standing), false)
})

test('never fight with your back to the void: the bot circles until its back points inward', () => {
  // ±4 platform; the bot stands 1.2 blocks from the -Z edge with the rival in front (+Z): every hit it
  // takes would push it off. A statue rival that never attacks, so only the bot's own moves count.
  const statue = { decide: () => ({ controls: {}, attack: false, look: { yaw: 0, pitch: 0 } }), onHurt () {} }
  for (const level of ['facil', 'normal', 'experto']) {
    const arena = new Arena({ seed: 1, rival: statue, level, ticks: 60, engineFactory, platform: { minX: -4, maxX: 4, minZ: -4, maxZ: 4 } })
    arena.self.entity.position.set(0.5, 0, -2.8)
    arena.rival.entity.position.set(0.5, 0, 0)
    let backedUp = false
    let inward = false
    for (let i = 0; i < 60; i++) {
      const before = arena.self.entity.position.z
      arena.step()
      if (i > 2 && i < 15 && arena.self.entity.position.z < before - 0.05) backedUp = true
      const room = arena.engine.roomBehind(arena.rival.entity)
      if (room !== null && room >= 2.5) inward = true
    }
    assert.strictEqual(arena.metrics().edgeFalls, 0, `${level} fell`)
    assert.strictEqual(backedUp, false, `${level} backed up toward the void`)
    assert.ok(inward, `${level} never turned its back away from the void`)
  }
})

test('a rival that swung in a known rhythm and then stands still does not freeze the bot behind its shield', () => {
  // ±4 platform, the bot 1.2 blocks from the -Z edge (guarded: its back to the void) and the rival 2.5
  // or 3 blocks in front. The rival's rhythm is taught through onTargetSwing (the hook the arena calls
  // on every rival swing), then it stands idle. Two rhythms: a steady 10-tick one, idle 20 ticks (twice
  // its interval) after its last swing; and quick 8-tick gaps with a 30-tick median, idle only after 40
  // ticks, so the shield cap (20 ticks up in a row) has to lower the shield first.
  //   - Free to move: the shield is never up more than 20 ticks in a row, the bot swings at the idle
  //     rival and never falls.
  //   - Both pinned in place (nobody comes in, so only the rival's rhythm can hold the shield up): once
  //     the rival is idle the shield never goes up again. Without the idle rule the decayed rhythm
  //     keeps it cycling 20 up / 10 down.
  const SHIELD_CAP = 20
  const statue = { decide: () => ({ controls: {}, attack: false, look: { yaw: 0, pitch: 0 } }), onHurt () {} }
  const rhythms = { steady: { gaps: [10, 10, 10, 10, 10, 10], idleAfter: 20 }, mixed: { gaps: [8, 30, 8, 30, 30, 30], idleAfter: 40 } }
  for (const level of ['facil', 'normal', 'experto']) {
    for (const [name, { gaps, idleAfter }] of Object.entries(rhythms)) {
      for (const apart of [2.5, 3.0]) {
        for (const pinned of [false, true]) {
          const label = `${level}, ${name} rhythm, ${apart} blocks${pinned ? ', pinned' : ''}`
          const arena = new Arena({ seed: 1, rival: statue, level, ticks: 120, engineFactory, platform: { minX: -4, maxX: 4, minZ: -4, maxZ: 4 } })
          const spots = [[arena.self, -2.8], [arena.rival, -2.8 + apart]]
          const place = () => {
            for (const [fighter, z] of spots) {
              fighter.entity.position.set(0.5, 0, z)
              fighter.entity.velocity.set(0, 0, 0)
              fighter.entity.onGround = true
            }
          }
          place()
          arena.step()
          const engine = arena.engine
          engine.onTargetSwing()
          for (const gap of gaps) {
            engine.tick += gap
            engine.onTargetSwing()
          }
          // Its last swing was 6 ticks ago: its sword is about to be ready, so the shield goes up at once
          engine.tick += 6
          assert.ok(engine.enemyReadyIn() <= 5, `${label}: the rhythm is known and its hit is due`)
          let streak = 0
          let longest = 0
          let raised = false
          let upWhileIdle = 0
          while (arena.tick < arena.ticks) {
            if (pinned) place()
            arena.step()
            const up = arena.self.blocking
            streak = up ? streak + 1 : 0
            longest = Math.max(longest, streak)
            if (up) raised = true
            if (up && engine.tick - engine.targetSwingTick > idleAfter) upWhileIdle++
          }
          const m = arena.metrics()
          assert.ok(raised, `${label}: the shield never went up (nothing tested)`)
          assert.ok(longest <= SHIELD_CAP, `${label}: shield up ${longest} ticks in a row`)
          assert.ok(m.hitsLanded >= 1, `${label}: the bot never swung at the idle rival`)
          assert.strictEqual(m.edgeFalls, 0, `${label}: fell`)
          if (pinned) assert.strictEqual(upWhileIdle, 0, `${label}: shield up ${upWhileIdle} ticks while the rival stood idle`)
        }
      }
    }
  }
})

test('trading with a spam-clicker never comes with the s-tap that avoids trading', () => {
  // The tanque spams: levels that read it trade charged hits ("Cambio golpes"). The s-tap after a hit
  // that keeps out of its reach ("s-tap para no cambiar golpes") says the opposite: never both at once
  for (const level of ['normal', 'dificil', 'experto']) {
    for (const seed of [1, 2]) {
      const arena = new Arena({ seed, rival: 'tanque', level, ticks: 2400, engineFactory })
      let trading = 0
      while (arena.tick < arena.ticks) {
        arena.step()
        const plan = arena.engine.plan
        const trade = plan.some((reason) => reason.startsWith('Cambio golpes'))
        const antiTrade = plan.some((reason) => reason.includes('s-tap para no cambiar golpes'))
        if (trade) trading++
        assert.ok(!(trade && antiTrade), `${level} seed ${seed} tick ${arena.tick}: ${plan.join(' | ')}`)
      }
      assert.ok(trading > 0, `${level} seed ${seed}: never traded (nothing tested)`)
    }
  }
})

test("the rival's reach is judged from where the server saw the bot, not from where it is now", () => {
  // The server resolves the rival's swing against the bot's last position packet. The reach the engine
  // learns from a hit taken, and the reach it fears each tick, must be that same distance
  const close = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`)
  for (const rival of ['strafer', 'jumpResetter']) {
    const arena = new Arena({ seed: 1, rival, level: 'experto', ticks: 800, engineFactory })
    arena.step()
    const engine = arena.engine
    let checking = false
    let fearChecks = 0
    let learnChecks = 0
    let moved = 0
    const context = engine.context.bind(engine)
    engine.context = (target) => {
      const ctx = context(target)
      if (checking) {
        close(ctx.enemyDistance, reachDistance(target.position, arena.self.server.position), `${rival} tick ${arena.tick} feared reach`)
        fearChecks++
      }
      return ctx
    }
    const onSelfHurt = engine.onSelfHurt.bind(engine)
    engine.onSelfHurt = (info) => {
      const before = engine.model.hitsTaken
      onSelfHurt(info)
      if (checking && engine.model.hitsTaken === before + 1) {
        const want = reachDistance(arena.rival.entity.position, arena.self.server.position)
        close(engine.model.reach[engine.model.reach.length - 1], want, `${rival} tick ${arena.tick} learned reach`)
        learnChecks++
        if (arena.self.server.position.distanceTo(arena.self.entity.position) > 0.05) moved++
      }
    }
    while (arena.tick < arena.ticks) {
      // A death or an edge fall teleports the bot without telling the engine: skip the tick after it
      const resets = arena.stats.deaths + arena.stats.kills + arena.stats.edgeFalls
      arena.step()
      checking = arena.stats.deaths + arena.stats.kills + arena.stats.edgeFalls === resets
    }
    assert.ok(fearChecks > 500, `${rival}: ${fearChecks} feared-reach checks`)
    assert.ok(learnChecks >= 5 && moved >= 3, `${rival}: ${learnChecks} hits taken checked, ${moved} while moving`)
  }
})

// ---- Final review fixes ------------------------------------------------------------------------

const fs = require('fs')
const os = require('os')
const path = require('path')
const { OpponentModel } = require('../brain/opponent')
const { RivalMemory } = require('../brain/memory')

test('with server-like rival updates the knockback reading stays honest: no false jump resets, KB near 1', () => {
  // A vanilla server sends the rival every 2 ticks, and its knockback shows up only after its own round
  // trip (rivalFeed: every 2 ticks, 1 to 3 ticks late). The strafer never jump resets and does not walk
  // against the knockback; the jump resetter jumps on 80 % of the hits it sees coming
  for (const level of ['normal', 'experto']) {
    for (const seed of [1, 2, 3]) {
      const plain = new Arena({ seed, rival: 'strafer', level, ticks: 2400, engineFactory, rivalFeed: true })
      plain.run()
      const p = plain.engine.model.summary()
      assert.ok(plain.engine.model.kbCount >= 10, `${level} seed ${seed}: ${plain.engine.model.kbCount} knockbacks measured`)
      assert.strictEqual(p.jumpResetRate, 0, `${level} seed ${seed}: strafer jump resets`)
      assert.ok(Math.abs(p.kbFactor - 1) <= 0.15, `${level} seed ${seed}: strafer kbFactor ${p.kbFactor}`)
      const resetter = new Arena({ seed, rival: 'jumpResetter', level, ticks: 2400, engineFactory, rivalFeed: true })
      resetter.run()
      const r = resetter.engine.model.summary()
      // High: above the 0.5 the tactics act on
      assert.ok(r.jumpResetRate >= 0.5, `${level} seed ${seed}: jumpResetter rate ${r.jumpResetRate}`)
    }
  }
})

test('with server-like rival updates its velocity neither drops to 0 nor doubles between updates', () => {
  // The rival strafes at walking speed and is never hit ('muevete'), so its real speed is constant
  const walker = { decide: () => ({ controls: { left: true }, attack: false, look: { yaw: 0, pitch: 0 } }), onHurt () {} }
  const WALK = 0.2159
  for (const seed of [1, 2, 3]) {
    const arena = new Arena({ seed, rival: walker, level: 'experto', ticks: 200, engineFactory, rivalFeed: true })
    arena.started = true
    arena.engine.start('muevete')
    let previous = arena.rivalView.position.clone()
    let still = 0
    let double = 0
    let checked = 0
    while (arena.tick < arena.ticks) {
      arena.step()
      const seen = arena.rivalView.position
      const perTick = Math.hypot(seen.x - previous.x, seen.z - previous.z) / WALK
      previous = seen.clone()
      if (arena.tick < 20) continue
      checked++
      if (perTick < 0.3) still++
      if (perTick > 1.6) double++
      const v = arena.engine.targetVelocity()
      const ratio = Math.hypot(v.x, v.z) / WALK
      assert.ok(ratio >= 0.4 && ratio <= 1.6, `seed ${seed} tick ${arena.tick}: ${ratio.toFixed(2)} times the walking speed`)
    }
    // The change from one tick to the next (what the engine used to read) really alternates here
    assert.ok(still > checked / 3 && double > checked / 6, `seed ${seed}: ${still} still and ${double} double of ${checked}`)
  }
})

test('with server-like rival updates a rival that comes in by itself is still waited for', () => {
  const runner = { decide: () => ({ controls: { forward: true, sprint: true }, attack: false, look: { yaw: 0, pitch: 0 } }), onHurt () {} }
  for (const rivalFeed of [null, true]) {
    const arena = new Arena({ seed: 1, rival: runner, level: 'experto', ticks: 30, engineFactory, rivalFeed })
    arena.rival.entity.position.z = 7.5
    arena.rivalView.position.z = 7.5
    let waited = 0
    while (arena.tick < arena.ticks) {
      arena.step()
      if (arena.engine.plan.some((reason) => reason.startsWith('Te espero'))) waited++
    }
    assert.ok(waited >= 3, `${rivalFeed ? 'server updates' : 'every tick'}: waited ${waited} ticks`)
  }
})

test('a muevete session neither changes nor saves the rival model', () => {
  const calls = []
  const memory = {
    load: (name) => { calls.push(`load:${name}`); return new OpponentModel() },
    info: () => ({ fights: 2, savedAt: null }),
    save: (name) => { calls.push(`save:${name}`); return true },
    forget: (name) => { calls.push(`forget:${name}`); return true }
  }
  const factory = (bot, hooks) => {
    const engine = new CombatEngine(bot, {
      getTarget: hooks.getTarget, shieldAllowed: () => true, paused: () => false, now: hooks.now, rng: hooks.rng,
      memory, opponentName: () => 'Rival'
    })
    engine.level = hooks.level
    return engine
  }
  // Longer than two periodic saves, against a rival that swings and hits
  const arena = new Arena({ seed: 1, rival: 'kiter', level: 'experto', ticks: 1300, engineFactory: factory })
  arena.started = true
  const engine = arena.engine
  const before = JSON.stringify(engine.model.toJSON())
  engine.start('muevete')
  arena.run()
  engine.stop()
  assert.ok(arena.stats.hitsTaken > 0, 'the rival never hit (nothing tested)')
  assert.deepStrictEqual(calls, [])
  assert.strictEqual(JSON.stringify(engine.model.toJSON()), before)
  // A fight still loads and saves
  engine.start('pelea')
  arena.ticks += 20
  arena.run()
  engine.stop()
  assert.deepStrictEqual(calls, ['load:Rival', 'save:Rival'])
})

test('a server teleport or a respawn resyncs the engine to where the bot is now', () => {
  const arena = new Arena({ seed: 1, rival: 'strafer', level: 'experto', ticks: 100, engineFactory })
  for (let i = 0; i < 30; i++) arena.step()
  const engine = arena.engine
  assert.ok(engine.distanceLog.length > 0 && engine.closingLog.length > 0 && engine.history.entries.length > 0)
  assert.ok(engine.rivalMotion.updates.length > 0)
  arena.self.entity.position.set(20, 0, 20)
  engine.resync()
  const view = engine.serverView()
  assert.deepStrictEqual([view.pos.x, view.pos.y, view.pos.z], [20, 0, 20])
  assert.strictEqual(view.dy, 0)
  assert.deepStrictEqual([engine.distanceLog.length, engine.closingLog.length, engine.history.entries.length], [0, 0, 0])
  assert.strictEqual(engine.rivalMotion.updates.length, 0)
  assert.strictEqual(engine.targetVelocity().norm(), 0)
  assert.strictEqual(engine.heldForRivalSwing().distanceTo(arena.self.entity.position), 0)
})

test('outside a fight the panel shows the remembered rival, read whole and never saved; stop clears the plan', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rivales-')), 'rivales.json')
  const memory = new RivalMemory(file)
  const factory = (opponentName) => (bot, hooks) => {
    const engine = new CombatEngine(bot, {
      getTarget: hooks.getTarget, shieldAllowed: () => true, paused: () => false, now: hooks.now, rng: hooks.rng,
      memory, opponentName
    })
    engine.level = hooks.level
    return engine
  }
  const fight = new Arena({ seed: 2, rival: 'strafer', level: 'experto', ticks: 400, engineFactory: factory(() => 'Rival') })
  fight.run()
  assert.ok(fight.engine.plan.length > 0)
  fight.engine.stop()
  assert.deepStrictEqual(fight.engine.plan, [])
  assert.deepStrictEqual(fight.engine.rivalSummary().plan, [])
  const saved = fs.readFileSync(file, 'utf8')
  const stored = JSON.parse(saved).rival.model
  assert.ok(stored.ticks > 100)

  // The bot restarted: no fight yet, the panel already knows the rival
  const idle = new Arena({ seed: 2, rival: 'strafer', level: 'experto', ticks: 1, engineFactory: factory(() => 'Rival') }).engine
  const reading = idle.rivalSummary()
  assert.strictEqual(reading.name, 'Rival')
  assert.strictEqual(reading.fights, 1)
  assert.strictEqual(reading.summary.samples, stored.ticks, 'read whole, not halved')
  assert.deepStrictEqual(reading.plan, [])
  idle.start('muevete')
  idle.rivalSummary()
  idle.stop()
  assert.strictEqual(fs.readFileSync(file, 'utf8'), saved, 'the display never saves')

  // Without an owner name the name is '' (the panel types it as a string)
  const nameless = new Arena({ seed: 2, rival: 'strafer', level: 'experto', ticks: 1, engineFactory: factory(() => null) }).engine
  assert.strictEqual(nameless.rivalSummary().name, '')
})

test('the sword goes back in hand the tick after an axe hit, never in the tick of the attack', () => {
  const statue = { decide: () => ({ controls: {}, attack: false, look: { yaw: 0, pitch: 0 } }), onHurt () {} }
  const arena = new Arena({ seed: 1, rival: statue, level: 'experto', ticks: 200, engineFactory })
  const bot = arena.bot
  const sword = { name: 'diamond_sword' }
  const axe = { name: 'diamond_axe' }
  bot.heldItem = axe
  bot.inventory.items = () => [sword, axe, { name: 'shield' }]
  const attacks = []
  const equips = []
  const attack = bot.attack
  bot.attack = (entity) => {
    attacks.push(arena.tick)
    attack(entity)
  }
  bot.equip = (item) => {
    equips.push({ tick: arena.tick, name: item.name })
    bot.heldItem = item
    return Promise.resolve()
  }
  arena.rival.entity.position.z = 2.8
  while (arena.tick < arena.ticks && equips.length === 0) arena.step()
  assert.ok(attacks.length >= 1, 'the bot never attacked (nothing tested)')
  assert.deepStrictEqual(equips, [{ tick: attacks[0] + 1, name: 'diamond_sword' }])
})
