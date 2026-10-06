'use strict'

// Deterministic duel arena for the sparring bot: a fake mineflayer bot driven by a pluggable engine
// against a scripted rival, with simplified vanilla 1.21 rules (movement, jump, gravity, knockback,
// sprint hits as the server applies them, crits, invulnerability, damage, shields, edge falls).
// Every run is fully decided by its seed: no Math.random, no Date.now, no wall clock.
//
// One tick, in mineflayer's order (its physics loop moves the bot, then emits `physicsTick`, then
// sends the position packet):
//   1. The bot moves, with the keys it pressed during the previous tick.
//   2. Decisions: the engine (`onPhysicsTick`) first, seeing its post-move state, then the rival script.
//      The rival goes second because the jump resetter has to see the bot's queued attack to jump in
//      the tick the hit lands.
//   3. Queued attacks (bot first, then rival). The bot's attack packets reach the server before this
//      tick's position packet: they are judged from the bot's PREVIOUS position, with the y change and
//      onGround of its previous move (what the server knew), and with the server sprint flag as it was
//      before any sprint toggle of this tick (vanilla sends the attack first; a bot that toggles sprint
//      in the tick it attacks counts a `packetOrderViolation`, Grim's PacketOrderF). The rival is
//      judged the same way: it decides seeing the bot where the server last saw it, and its attacks
//      are resolved against that position (a real rival sees the bot even later, never earlier).
//      Deaths are settled after.
//   4. The rival moves, then edge falls.
//
// Modelling notes (see also sim/world.js for the ground):
//   - The sprint FLAG the server sees rises only on the rising edge of the sprint control (mineflayer sends
//     "start sprinting" only when that control changes) and falls when the control is released or after a
//     sprint hit. Movement (speed, sprint jump) follows the sprint CONTROL, like a client does.
//   - Support is decided on the center point of the feet: stricter than vanilla's box overlap, so a bot
//     that never falls here never falls in the real game either.
//   - No entity collision and no attacker slowdown after a sprint hit.
//   - Reach is the eye-to-box distance (world.reachDistance); landed hits are measured the same way.
//   - Jump reset: a victim whose first move after a knockback is a jump from the ground keeps
//     JUMP_RESET_FACTOR of the horizontal push (the rival jumps in the tick the hit lands; the bot jumps
//     on its next move, pressed from `onHurt` like the real engine does from the velocity packet).
//   - Metrics: critAttempts / sprintAttempts count the bot's attacks that reach the rival (in reach and
//     aimed); sprintAttempts uses the sprint key as it was before this tick's toggle. Misses go to blindAttacks / outOfReachAttempts only, and an attack is classified as out of
//     reach before it is checked for aim. Damage is counted in full, even past the target's last health.
//   - A death resets both fighters; an edge fall only sends the one who fell back to its start. Whoever
//     starts over holds no key and is not sprinting for the server, like a client after a respawn.
//     Neither tells the engine (it gets no hook): it finds its keys released, and its shield survives.
//   - By default the engine sees the rival's real entity, updated every tick. With `rivalFeed` it sees
//     a copy fed like a vanilla server feeds a client: the rival's state at the end of every
//     `every`-th tick (2: a player's update interval), delivered `lag` ticks later (each update rolls
//     its lag from the seed; updates never overtake each other). Delivery happens before the engine
//     decides. The hits are still judged on the real rival; only what the bot sees is late.

const { Vec3 } = require('vec3')
const { PHYS, canCrit, knockbackSpeed } = require('../brain/physics')
const { rayHitsBox, entityBox } = require('../combat')
const { seeded, deriveSeed } = require('./rng')
const { createWorld, reachDistance, EYE_HEIGHT } = require('./world')
const { createRival } = require('./rivals')

const BODY_WIDTH = 0.6
const BODY_HEIGHT = 1.8
const MAX_HEALTH = 20
const BASE_DAMAGE = 7
// Falling below this height counts as falling off the arena
const VOID_Y = -20
// Ticks for a swing to be fully charged is 12.5 (the +0.5 is the half tick vanilla grants)
const CHARGE_TICKS = 12.5
const TICK_MS = 50
const NEVER = -1000
const CONTROLS = ['forward', 'back', 'left', 'right', 'jump', 'sprint', 'sneak']
const BOT_START = { x: 0, y: 0, z: 0 }
const RIVAL_START = { x: 0, y: 0, z: 4 }
// yaw 0 looks to -Z, so the bot looks to +Z (at the rival) with yaw PI and the rival to -Z with yaw 0
const BOT_YAW = Math.PI
const RIVAL_YAW = 0
const STREAM_SALT_ENGINE = 0xE9E1
const STREAM_SALT_FEED = 0xFEED
// rivalFeed: true means a vanilla server's player tracking: every 2 ticks, 1 to 3 ticks late
const DEFAULT_FEED = { every: 2, lag: [1, 3] }

const round3 = (value) => Math.round(value * 1000) / 1000

/** One of the two players: the mineflayer-shaped entity plus the server-side state of the duel. */
class Fighter {
  constructor (id, start, yaw) {
    this.start = start
    this.startYaw = yaw
    this.entity = {
      id,
      position: new Vec3(start.x, start.y, start.z),
      velocity: new Vec3(0, 0, 0),
      onGround: true,
      yaw,
      pitch: 0,
      height: BODY_HEIGHT,
      width: BODY_WIDTH,
      isValid: true,
      metadata: {},
      equipment: []
    }
    this.controlState = {}
    for (const control of CONTROLS) this.controlState[control] = false
    this.health = MAX_HEALTH
    // The sprint flag the server holds (see the notes at the top)
    this.serverSprinting = false
    // Tick of the last attack or swing: the 1.9+ charge counts from here
    this.lastAttackTick = NEVER
    this.lastHurtTick = NEVER
    // Shield raised (only the bot ever raises one)
    this.blocking = false
    // Attacks queued in the current tick, not resolved yet
    this.attackQueued = 0
    // State at the end of the previous tick: what an attack resolved in this tick sees (rival)
    this.snapshot = { vy: 0, onGround: true }
    // What the server knew of the bot when its attacks of this tick arrived (bot only, see step)
    this.server = { position: new Vec3(start.x, start.y, start.z), onGround: true, dy: 0 }
    // Vertical change of the last move
    this.lastDy = 0
    // A knockback that has not moved the fighter yet (its next move decides a jump reset)
    this.kbPending = false
    // Sprint as it was before this tick's decisions, and whether a decision toggled it
    this.sprintFlagBefore = false
    this.sprintControlBefore = false
    this.sprintToggled = false
  }

  setControl (control, value) {
    if (!(control in this.controlState)) throw new Error(`invalid control: ${control}`)
    const next = Boolean(value)
    const previous = this.controlState[control]
    this.controlState[control] = next
    if (control === 'sprint' && next !== previous) {
      this.serverSprinting = next
      this.sprintToggled = true
    }
  }

  /**
   * Back to the start position with no motion, as a new round (a death or a fall into the void). Like a
   * client after a respawn, no key is held and the server sprint flag is down; health and timers are
   * not touched.
   */
  teleportToStart () {
    const { position, velocity } = this.entity
    position.set(this.start.x, this.start.y, this.start.z)
    velocity.set(0, 0, 0)
    this.entity.onGround = true
    this.lastDy = 0
    this.kbPending = false
    for (const control of CONTROLS) this.controlState[control] = false
    this.serverSprinting = false
  }

  /**
   * A new round: back to the start facing the start direction, full health, no invulnerability, no key
   * held (see teleportToStart). The engine gets no hook for it: it finds its keys released, and the
   * shield (an item in use, which the engine tracks itself) is left as it was.
   */
  respawn () {
    this.teleportToStart()
    this.entity.yaw = this.startYaw
    this.entity.pitch = 0
    this.health = MAX_HEALTH
    this.lastHurtTick = NEVER
  }
}

class Arena {
  /**
   * @param {object} options
   * @param {number} [options.seed] seeds the rival and (separately) the engine
   * @param {{minX:number,maxX:number,minZ:number,maxZ:number}|null} [options.platform] block coordinates, inclusive
   * @param {string|object} options.rival a kind for createRival, or a `{ decide, onHurt }` script
   * @param {Function} options.engineFactory (bot, hooks) => engine
   * @param {number} [options.ticks] how long run() lasts
   * @param {string} [options.level] difficulty level handed to the engine through the hooks
   * @param {boolean|{every:number,lag:[number,number]}} [options.rivalFeed] the engine sees the rival
   *   through server-like position updates (see the notes at the top); true = every 2 ticks, 1-3 late
   */
  constructor ({ seed = 1, platform = null, rival, engineFactory, ticks = 2400, level = 'normal', rivalFeed = null } = {}) {
    if (typeof engineFactory !== 'function') throw new Error('Arena needs an engineFactory(bot, hooks)')
    this.seed = seed
    this.ticks = ticks
    this.level = level
    this.tick = 0
    this.started = false
    this.world = createWorld({ platform })
    this.self = new Fighter(1, BOT_START, BOT_YAW)
    this.rival = new Fighter(2, RIVAL_START, RIVAL_YAW)
    this.rivalScript = typeof rival === 'string' ? createRival(rival, seeded(seed)) : rival
    if (!this.rivalScript || typeof this.rivalScript.decide !== 'function') {
      throw new Error('Arena needs a rival kind or a { decide, onHurt } script')
    }
    this.attacks = []
    // Edge falls of the scripted rival: not part of the metrics, handy to debug an arena setup
    this.rivalEdgeFalls = 0
    this.stats = {
      hitsLanded: 0,
      critsLanded: 0,
      critAttempts: 0,
      sprintAttempts: 0,
      sprintHitsReal: 0,
      hitDistanceSum: 0,
      maxHitDistance: 0,
      hitsTaken: 0,
      damageDealt: 0,
      damageTaken: 0,
      deaths: 0,
      kills: 0,
      edgeFalls: 0,
      blindAttacks: 0,
      outOfReachAttempts: 0,
      packetOrderViolations: 0
    }
    // What the engine sees of the rival: its real entity, or a late copy (rivalFeed)
    this.feed = null
    this.rivalView = this.rival.entity
    if (rivalFeed) {
      const options = rivalFeed === true ? DEFAULT_FEED : { ...DEFAULT_FEED, ...rivalFeed }
      this.feed = { ...options, rng: seeded(deriveSeed(seed, STREAM_SALT_FEED)), queue: [], lastArrival: 0 }
      const real = this.rival.entity
      this.rivalView = { ...real, position: real.position.clone(), velocity: real.velocity.clone() }
    }
    this.bot = this.createBot()
    this.engine = engineFactory(this.bot, {
      getTarget: () => this.rivalView,
      now: () => this.tick * TICK_MS,
      rng: seeded(deriveSeed(seed, STREAM_SALT_ENGINE)),
      level
    })
  }

  /** The slice of the mineflayer bot API the engine uses, backed by the bot fighter. */
  createBot () {
    const fighter = this.self
    return {
      username: 'WatitaBot',
      entity: fighter.entity,
      controlState: fighter.controlState,
      heldItem: { name: 'diamond_sword' },
      inventory: {
        items: () => [{ name: 'diamond_sword' }, { name: 'shield' }],
        slots: { 45: { name: 'shield' } }
      },
      setControlState: (control, value) => fighter.setControl(control, value),
      getControlState: (control) => {
        if (!(control in fighter.controlState)) throw new Error(`invalid control: ${control}`)
        return fighter.controlState[control]
      },
      look: (yaw, pitch) => {
        fighter.entity.yaw = yaw
        fighter.entity.pitch = pitch
        return Promise.resolve()
      },
      attack: (entity) => {
        // Attacking anything but the rival (or the late copy the engine sees of it) is not possible here
        if (entity !== this.rival.entity && entity !== this.rivalView) return
        this.queueAttack(fighter, this.rival)
      },
      // A swing in the air resets the 1.9+ charge, like a real click
      swingArm: () => { fighter.lastAttackTick = this.tick },
      equip: () => Promise.resolve(),
      activateItem: () => { fighter.blocking = true },
      deactivateItem: () => { fighter.blocking = false },
      blockAt: (...args) => this.world.blockAt(...args)
    }
  }

  /**
   * The bot as the rival (and the server) knows it this tick: the position and vertical state of its
   * last position packet. The rival scripts only read `.entity` and `.attackQueued`.
   */
  serverViewOf (bot) {
    const entity = { ...bot.entity, position: bot.server.position.clone(), onGround: bot.server.onGround }
    return { entity, get attackQueued () { return bot.attackQueued } }
  }

  /** Where the server holds a fighter while this tick's attacks resolve (the bot: its last packet). */
  seenAt (fighter) {
    return fighter === this.self ? fighter.server.position : fighter.entity.position
  }

  queueAttack (attacker, target) {
    attacker.attackQueued++
    this.attacks.push({ attacker, target })
  }

  step () {
    if (!this.started) {
      this.started = true
      this.engine.start('pelea')
    }
    this.tick++
    const bot = this.self

    // 1. The bot moves first; the server still holds the state it sent at the end of the last tick
    bot.server = { position: bot.entity.position.clone(), onGround: bot.entity.onGround, dy: bot.lastDy }
    this.move(bot)
    // The rival updates that arrived since the last tick (rivalFeed only)
    this.deliverRivalFeed()

    // 2. Decisions
    bot.sprintFlagBefore = bot.serverSprinting
    bot.sprintControlBefore = bot.controlState.sprint
    bot.sprintToggled = false
    this.engine.onPhysicsTick()
    this.applyRivalDecision(this.rivalScript.decide(this.rival, this.serverViewOf(bot), this.tick))

    // 3. Attacks
    for (const fighter of [this.self, this.rival]) {
      fighter.snapshot = { vy: fighter.entity.velocity.y, onGround: fighter.entity.onGround }
    }
    const attacks = this.attacks
    this.attacks = []
    for (const { attacker, target } of attacks) this.resolveAttack(attacker, target)
    this.self.attackQueued = 0
    this.rival.attackQueued = 0
    this.settleDeaths()

    // 4. The rival moves, then edge falls
    this.move(this.rival)
    this.settleEdgeFalls()
    this.sendRivalFeed()
  }

  /** Every `every`-th tick the server sends the rival's state; it arrives `lag` ticks later, in order. */
  sendRivalFeed () {
    const feed = this.feed
    if (!feed || this.tick % feed.every !== 0) return
    const [minLag, maxLag] = feed.lag
    const lag = minLag + Math.floor(feed.rng() * (maxLag - minLag + 1))
    const arrival = Math.max(feed.lastArrival, this.tick + lag)
    feed.lastArrival = arrival
    const e = this.rival.entity
    feed.queue.push({
      arrival,
      position: e.position.clone(),
      velocity: e.velocity.clone(),
      onGround: e.onGround,
      yaw: e.yaw,
      pitch: e.pitch
    })
  }

  /** Applies the updates due by this tick to the copy of the rival the engine sees. */
  deliverRivalFeed () {
    const feed = this.feed
    if (!feed) return
    while (feed.queue.length > 0 && feed.queue[0].arrival <= this.tick) {
      const update = feed.queue.shift()
      const view = this.rivalView
      view.position.set(update.position.x, update.position.y, update.position.z)
      view.velocity.set(update.velocity.x, update.velocity.y, update.velocity.z)
      view.onGround = update.onGround
      view.yaw = update.yaw
      view.pitch = update.pitch
    }
  }

  applyRivalDecision (decision) {
    const controls = decision.controls || {}
    for (const control of CONTROLS) this.rival.setControl(control, Boolean(controls[control]))
    if (decision.look) {
      this.rival.entity.yaw = decision.look.yaw
      this.rival.entity.pitch = decision.look.pitch
    }
    if (decision.attack) this.queueAttack(this.rival, this.self)
  }

  /** Resolves one queued attack: validity, charge, damage, crit, sprint hit, shield, knockback. */
  resolveAttack (attacker, target) {
    const isBot = attacker === this.self
    const stats = this.stats
    const charge = Math.min(1, (this.tick - attacker.lastAttackTick + 0.5) / CHARGE_TICKS)
    // Any attack is a swing too: it restarts the charge whether or not it connects
    attacker.lastAttackTick = this.tick

    if (!isBot) this.engine.onTargetSwing()
    // The sprint key changed in this very tick: the packets went out in the wrong order
    if (isBot && attacker.sprintToggled) stats.packetOrderViolations++

    // Both fighters are judged where the server holds them: the bot at its last position packet (its
    // attack arrives before its new position), the rival where it is (it has not moved yet)
    const from = this.seenAt(attacker)
    const to = this.seenAt(target)
    const distance = reachDistance(from, to)
    if (distance > PHYS.MAX_REACH) {
      if (isBot) stats.outOfReachAttempts++
      return
    }
    if (isBot) {
      // Rivals aim perfectly; the bot has to have its crosshair on the rival's box
      const eye = from.offset(0, EYE_HEIGHT, 0)
      const box = entityBox(to, BODY_WIDTH, BODY_HEIGHT)
      if (!rayHitsBox(eye, attacker.entity.yaw, attacker.entity.pitch, box, PHYS.MAX_REACH)) {
        stats.blindAttacks++
        return
      }
      // An attempt is an attack that reaches the rival: the ones that miss have their own counters
      // (blindAttacks, outOfReachAttempts), so a miss never shows up as a failed crit or sprint hit.
      if (!attacker.server.onGround) stats.critAttempts++
      if (attacker.sprintControlBefore) stats.sprintAttempts++
    }
    if (this.tick - target.lastHurtTick < PHYS.INVULNERABLE_TICKS) return
    if (target.blocking && this.isInFront(target, to, from)) return

    // The hit lands. The bot's flag is the one from before this tick's toggle, and its vertical state
    // the one of its last move (the server's fall distance only grows with a downward move it received)
    const sprinting = isBot ? attacker.sprintFlagBefore : attacker.serverSprinting
    const sprintHit = sprinting && charge > PHYS.CRIT_CHARGE
    const crit = canCrit({
      charge,
      onGround: isBot ? attacker.server.onGround : attacker.snapshot.onGround,
      vy: isBot ? attacker.server.dy : attacker.snapshot.vy,
      sprinting
    })
    const damage = BASE_DAMAGE * (0.2 + 0.8 * charge * charge) * (crit ? 1.5 : 1)
    target.health -= damage
    target.lastHurtTick = this.tick
    // A sprint hit spends the flag; a toggle of the same tick reached the server after the attack
    if (sprintHit && !(isBot && attacker.sprintToggled)) attacker.serverSprinting = false
    this.applyKnockback(attacker, from, to, target, sprintHit)

    if (isBot) {
      stats.hitsLanded++
      if (crit) stats.critsLanded++
      if (sprintHit) stats.sprintHitsReal++
      stats.damageDealt += damage
      stats.hitDistanceSum += distance
      stats.maxHitDistance = Math.max(stats.maxHitDistance, distance)
      this.rivalScript.onHurt?.(this.tick)
      this.engine.onTargetHurt()
    } else {
      stats.hitsTaken++
      stats.damageTaken += damage
      this.engine.onHurt()
      this.engine.onSelfHurt({ byTarget: true })
    }
  }

  /** The attacker (at `from`) is in the half plane the shield of the target (at `at`) covers. */
  isInFront (target, at, from) {
    const yaw = target.entity.yaw
    const dx = from.x - at.x
    const dz = from.z - at.z
    return -Math.sin(yaw) * dx + -Math.cos(yaw) * dz > 0
  }

  /**
   * Horizontal push of the target (seen at `to`) away from the attacker (seen at `from`), 0.7 on a sprint hit and 0.4 otherwise;
   * vertical 0.4. The jump reset is decided by the victim's next move (see move).
   */
  applyKnockback (attacker, from, to, target, sprintHit) {
    let dx = to.x - from.x
    let dz = to.z - from.z
    const length = Math.hypot(dx, dz)
    if (length < 1e-9) {
      // Standing on top of each other: push along the attacker's look
      dx = -Math.sin(attacker.entity.yaw)
      dz = -Math.cos(attacker.entity.yaw)
    } else {
      dx /= length
      dz /= length
    }
    const speed = knockbackSpeed({ sprintHit })
    target.entity.velocity.set(dx * speed, PHYS.KB_VERTICAL, dz * speed)
    target.kbPending = true
  }

  /** A death ends the round: deaths/kills are counted and both fighters start over. */
  settleDeaths () {
    const botDead = this.self.health <= 0
    const rivalDead = this.rival.health <= 0
    if (botDead) this.stats.deaths++
    if (rivalDead) this.stats.kills++
    if (botDead || rivalDead) {
      this.self.respawn()
      this.rival.respawn()
    }
  }

  /** One tick of movement: input, acceleration, jump, friction, gravity and landing. */
  move (fighter) {
    const { entity, controlState: controls } = fighter
    const onGround = entity.onGround
    const sin = Math.sin(entity.yaw)
    const cos = Math.cos(entity.yaw)

    // Input along the look direction, normalized so strafing diagonally is not faster
    const forward = (controls.forward ? 1 : 0) - (controls.back ? 1 : 0)
    const left = (controls.left ? 1 : 0) - (controls.right ? 1 : 0)
    let inputX = -sin * forward - cos * left
    let inputZ = -cos * forward + sin * left
    const inputLength = Math.hypot(inputX, inputZ)
    if (inputLength > 0) {
      inputX /= inputLength
      inputZ /= inputLength
    }
    const sprintMove = controls.sprint && forward > 0
    let accel
    if (onGround) accel = sprintMove ? PHYS.SPRINT_ACCEL : PHYS.WALK_ACCEL
    else accel = sprintMove ? PHYS.AIR_SPRINT_ACCEL : PHYS.AIR_ACCEL
    const accelX = inputX * accel
    const accelZ = inputZ * accel

    let { x: vx, y: vy, z: vz } = entity.velocity
    // Jump reset: the first move after a knockback is a jump from the ground, the push is cut
    if (fighter.kbPending) {
      if (controls.jump && onGround) {
        vx *= PHYS.JUMP_RESET_FACTOR
        vz *= PHYS.JUMP_RESET_FACTOR
      }
      fighter.kbPending = false
    }
    if (controls.jump && onGround) {
      vy = PHYS.JUMP_VELOCITY
      if (sprintMove) {
        vx -= sin * PHYS.SPRINT_JUMP_BOOST
        vz -= cos * PHYS.SPRINT_JUMP_BOOST
      }
    }

    // Horizontal: position takes the velocity plus this tick's acceleration, then friction slows it
    const friction = onGround ? PHYS.GROUND_FRICTION : PHYS.AIR_FRICTION
    entity.position.x += vx + accelX
    entity.position.z += vz + accelZ
    vx = (vx + accelX) * friction
    vz = (vz + accelZ) * friction

    // Vertical: move first, then gravity; land when crossing the surface with solid ground below
    const previousY = entity.position.y
    entity.position.y += vy
    vy = (vy - PHYS.GRAVITY) * PHYS.AIR_DRAG
    if (entity.position.y <= 0 && previousY >= 0 && this.world.floorAt(entity.position.x, entity.position.z)) {
      entity.position.y = 0
      vy = 0
      entity.onGround = true
    } else {
      entity.onGround = false
    }
    entity.velocity.set(vx, vy, vz)
    fighter.lastDy = entity.position.y - previousY
  }

  /** Whoever dropped into the void reappears at its start position (the rival's falls are not metrics). */
  settleEdgeFalls () {
    if (this.self.entity.position.y < VOID_Y) {
      this.stats.edgeFalls++
      this.self.teleportToStart()
    }
    if (this.rival.entity.position.y < VOID_Y) {
      this.rivalEdgeFalls++
      this.rival.teleportToStart()
    }
  }

  /** Plain numbers only: the same seed gives a deepStrictEqual result. */
  metrics () {
    const s = this.stats
    return {
      hitsLanded: s.hitsLanded,
      critsLanded: s.critsLanded,
      critAttempts: s.critAttempts,
      sprintAttempts: s.sprintAttempts,
      sprintHitsReal: s.sprintHitsReal,
      avgHitDistance: s.hitsLanded > 0 ? round3(s.hitDistanceSum / s.hitsLanded) : 0,
      maxHitDistance: s.maxHitDistance,
      hitsTaken: s.hitsTaken,
      damageDealt: s.damageDealt,
      damageTaken: s.damageTaken,
      deaths: s.deaths,
      kills: s.kills,
      edgeFalls: s.edgeFalls,
      blindAttacks: s.blindAttacks,
      outOfReachAttempts: s.outOfReachAttempts,
      packetOrderViolations: s.packetOrderViolations
    }
  }

  run () {
    while (this.tick < this.ticks) this.step()
    return this.metrics()
  }
}

/** One whole duel of `ticks` ticks (2400 = two minutes) and its metrics. */
function runDuel ({ level, rival, ticks = 2400, seed = 1, platform = null, engineFactory, rivalFeed = null } = {}) {
  return new Arena({ seed, platform, rival, engineFactory, ticks, level, rivalFeed }).run()
}

module.exports = { Arena, runDuel }
