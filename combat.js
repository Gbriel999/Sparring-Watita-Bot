'use strict'
// Modern (1.9+) sword PvP for the sparring bot, played the way a good player does it with mouse and
// keys: delayed and imperfect aim that leads the target, hits only with the crosshair on the target
// and the sword charged. Every tick it observes the rival (brain/opponent.js learns its habits),
// aims, decides with brain/tactics.js (hit style, crit jump, spacing, w-tap / s-tap, strafe, shield,
// combo break), keeps away from edges (brain/terrain.js) and only then presses keys and swings.
// Nothing a vanilla client cannot do: reach 3.0, the look ray must cross the box, the camera turns
// with a speed cap and noise, and the reaction time is human.

const { Vec3 } = require('vec3')
const { PHYS, canCrit } = require('./brain/physics')
const { safeControls, isDangerous, moveVectors } = require('./brain/terrain')
const { OpponentModel } = require('./brain/opponent')
const tactics = require('./brain/tactics')

const DEG = Math.PI / 180
const EYE_HEIGHT = 1.62
const REACH = 3.0
// Living entity flags: index 8 since 1.17, bit 0 = using an item (a raised shield)
const LIVING_FLAGS_INDEX = 8
// Farther than this (eye to box) there is nothing to plan: sprint in
const CHASE_DISTANCE = 4.2
// ...unless the rival is coming back by itself and is closer than this
const CHASE_WAIT = 8
// The longest wait (ticks) for a rival that comes back by itself before walking in anyway
const WAIT_MAX = 20
// Ticks of the knockback flight after a hit taken (vy 0.4 keeps a player airborne about 11 ticks)
const KB_FLIGHT_TICKS = 12
// The server sees each move one tick after the client made it (mineflayer moves, then emits
// physicsTick, then sends the position): crit timing and reach are judged on that older state
const SERVER_LAG_TICKS = 1
// A vanilla shield blocks only after 5 ticks of use: it goes up this many ticks before the
// 1-tick margin planShield already keeps
const SHIELD_WARMUP = 4
// A hit taken farther than this (blocks, horizontal) from the rival is not its hit (fall, fire, lava)
const RIVAL_HIT_RANGE = 4.5
// Blocks of open ground wanted behind the bot (away from the rival): a grounded sprint hit pushes
// about 3.5 blocks, holding forward in the air takes about 1 of them back
const EDGE_ROOM = 3.5
// Less open ground than this behind the bot is fighting with the back to the void: circle inward
const EDGE_BACK = 2.5
// Near an edge, a rival that swung less than this many ticks ago (or is coming in) is a threat
const EDGE_THREAT_TICKS = 20
// A movement key "leads inward" when its direction is at least this aligned with the open ground
const INWARD_MIN = 0.3
// Within this much more room the bot already prefers strafing toward the center
const EDGE_SOFT = 1.5
// Closing faster than this (blocks per tick) means coming in (the distance, or the rival toward the bot)
const CLOSING_FAST = 0.05
// Ticks between lowering the shield and the next hit (the spec drops it 2 ticks before ours is ready)
const SHIELD_DROP_TICKS = 2
// A raised shield stands the bot still and blocks its swings: it stays up at most this many ticks in
// a row, then comes down for at least SHIELD_REST ticks so the bot moves and swings again
const SHIELD_MAX_UP = 20
const SHIELD_REST = 10
// A rival that has not swung for twice its swing interval (and never for more than this many ticks)
// is standing idle, not winding up: its rhythm no longer says when its hit comes, so the shield
// does not wait for it
const RIVAL_IDLE_MAX = 40
// Swings that come less than this many ticks after the previous one are spam (little charge)
const WEAK_SWING_GAP = 10
// Levels with at least this model weight read the charge of the rival's swing
const READ_SWING_WEIGHT = 0.8
// A crit jump is only worth it if the fall lands its hit no closer than hitDistance minus this
const CRIT_CLOSE_MARGIN = 0.45
// The look from the top of a jump adds height to the reach: planned crits stay under this
const CRIT_MAX_REACH = 2.85
// How far the edge scan looks and its step
const ROOM_SCAN = 6
const ROOM_STEP = 0.5
// Rival swing gaps the engine keeps for its readiness estimate (gaps above MAX_SWING_GAP are pauses)
const MAX_SWING_GAP = 40
const SWING_GAPS_KEPT = 30
const MIN_RHYTHM_GAPS = 4
const QUICK_GAP_PERCENTILE = 0.2
// The opponent model is saved this often during a fight (ticks)
const SAVE_EVERY = 600
// A vanilla server sends other players' positions every 2 ticks (and late, with jitter), so the
// rival's velocity is the change between position updates over the ticks between them. The last
// RIVAL_UPDATES_KEPT updates are kept; a gap longer than RIVAL_MAX_GAP ticks counts as RIVAL_MAX_GAP
// (the rival stood still in between, it did not crawl)
const RIVAL_UPDATES_KEPT = 5
const RIVAL_MAX_GAP = 4
// At most this many reasons are shown in the panel
const MAX_REASONS = 4
const CONTROLS = ['forward', 'back', 'left', 'right', 'jump', 'sprint', 'sneak']

// Attacks per second of each weapon (1.9+); empty hand and anything else: 4
const AXE_SPEED = { wooden: 0.8, stone: 0.8, iron: 0.9, golden: 1.0, diamond: 1.0, netherite: 1.0 }

const LEVELS = {
  facil: {
    reactionMs: [220, 320], turnFraction: [0.25, 0.4], maxTurnDeg: 25, jitterDeg: 1.2, missChance: 0.12,
    extraCooldown: [1, 4], critChance: 0.35, wtapChance: 0.4, stapChance: 0.2, jumpResetChance: 0.15,
    shieldChance: 0.15, dodgeChance: 0.15, leadTicks: [0, 1], spacingChance: 0.4,
    modelWeight: 0.15, planNoise: 2, predictKnockback: false, hitDistance: 2.6, holdMargin: 0.2, dodgeOnReady: 0.15
  },
  normal: {
    reactionMs: [150, 240], turnFraction: [0.35, 0.55], maxTurnDeg: 35, jitterDeg: 0.8, missChance: 0.06,
    extraCooldown: [0, 2], critChance: 0.6, wtapChance: 0.7, stapChance: 0.35, jumpResetChance: 0.4,
    shieldChance: 0.3, dodgeChance: 0.3, leadTicks: [1, 2], spacingChance: 0.7,
    modelWeight: 0.5, planNoise: 1, predictKnockback: true, hitDistance: 2.75, holdMargin: 0.3, dodgeOnReady: 0.35
  },
  dificil: {
    reactionMs: [110, 170], turnFraction: [0.45, 0.7], maxTurnDeg: 45, jitterDeg: 0.5, missChance: 0.025,
    extraCooldown: [0, 1], critChance: 0.85, wtapChance: 0.9, stapChance: 0.5, jumpResetChance: 0.7,
    shieldChance: 0.45, dodgeChance: 0.45, leadTicks: [2, 3], spacingChance: 0.9,
    modelWeight: 0.8, planNoise: 0, predictKnockback: true, hitDistance: 2.85, holdMargin: 0.35, dodgeOnReady: 0.55
  },
  experto: {
    reactionMs: [90, 130], turnFraction: [0.5, 0.75], maxTurnDeg: 55, jitterDeg: 0.4, missChance: 0.015,
    extraCooldown: [0, 0], critChance: 0.9, wtapChance: 1, stapChance: 0.5, jumpResetChance: 0.85,
    shieldChance: 0.6, dodgeChance: 0.55, leadTicks: [2, 3], spacingChance: 1,
    modelWeight: 1, planNoise: 0, predictKnockback: true, hitDistance: 2.92, holdMargin: 0.35, dodgeOnReady: 0.7
  }
}

// ---- Pure helpers (tested in combat.test.js) -------------------------------------------------

/** Angle in (-pi, pi]. */
function wrapAngle (angle) {
  let wrapped = angle % (2 * Math.PI)
  if (wrapped <= -Math.PI) wrapped += 2 * Math.PI
  if (wrapped > Math.PI) wrapped -= 2 * Math.PI
  return wrapped
}

/** Mineflayer yaw/pitch (radians; yaw 0 looks to -Z, positive pitch looks up) from eye to point. */
function anglesTo (eye, point) {
  const dx = point.x - eye.x
  const dy = point.y - eye.y
  const dz = point.z - eye.z
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)) }
}

function clamp (value, min, max) {
  return Math.max(min, Math.min(max, value))
}

/**
 * One tick of a human turn: a fraction of the remaining angle, never faster than maxTurn, plus a
 * little noise. Always the short way round.
 */
function aimStep (current, wanted, fraction, maxTurn, jitter, rng) {
  const yawStep = clamp(wrapAngle(wanted.yaw - current.yaw) * fraction, -maxTurn, maxTurn) + (rng() * 2 - 1) * jitter
  const pitchStep = clamp((wanted.pitch - current.pitch) * fraction, -maxTurn, maxTurn) + (rng() * 2 - 1) * jitter * 0.5
  return {
    yaw: wrapAngle(current.yaw + yawStep),
    pitch: clamp(current.pitch + pitchStep, -Math.PI / 2, Math.PI / 2)
  }
}

function entityBox (position, width, height) {
  return {
    min: new Vec3(position.x - width / 2, position.y, position.z - width / 2),
    max: new Vec3(position.x + width / 2, position.y + height, position.z + width / 2)
  }
}

/** The look ray from the eye hits the box within reach (slab test). */
function rayHitsBox (eye, yaw, pitch, box, reach) {
  const dir = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)]
  const origin = [eye.x, eye.y, eye.z]
  const low = [box.min.x, box.min.y, box.min.z]
  const high = [box.max.x, box.max.y, box.max.z]
  let tMin = 0
  let tMax = reach
  for (let axis = 0; axis < 3; axis++) {
    if (Math.abs(dir[axis]) < 1e-9) {
      if (origin[axis] < low[axis] || origin[axis] > high[axis]) return false
      continue
    }
    const t1 = (low[axis] - origin[axis]) / dir[axis]
    const t2 = (high[axis] - origin[axis]) / dir[axis]
    tMin = Math.max(tMin, Math.min(t1, t2))
    tMax = Math.min(tMax, Math.max(t1, t2))
    if (tMin > tMax) return false
  }
  return true
}

/** Ticks until a weapon is fully charged again (1.9+ attack speed). */
function cooldownTicks (itemName) {
  let speed = 4.0
  if (itemName) {
    if (itemName.endsWith('_sword')) speed = 1.6
    else if (itemName.endsWith('_axe')) speed = AXE_SPEED[itemName.slice(0, -4)] || 1.0
    else if (itemName === 'trident') speed = 1.1
    else if (itemName === 'mace') speed = 0.6
  }
  return Math.ceil(20 / speed)
}

function isWeapon (item) {
  return Boolean(item && (item.name.endsWith('_sword') || item.name.endsWith('_axe')
    || item.name === 'trident' || item.name === 'mace'))
}

/** Where the target was some milliseconds ago: what a person reacts to. */
class PositionHistory {
  constructor (maxEntries) {
    this.maxEntries = maxEntries
    this.entries = []
  }

  push (timeMs, position) {
    this.entries.push({ timeMs, position: position.clone() })
    if (this.entries.length > this.maxEntries) this.entries.shift()
  }

  at (timeMs) {
    if (this.entries.length === 0) return null
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i].timeMs <= timeMs) return this.entries[i].position
    }
    return this.entries[0].position
  }

  /** Movement per tick of the latest entries. */
  velocity () {
    const n = this.entries.length
    if (n < 2) return new Vec3(0, 0, 0)
    return this.entries[n - 1].position.minus(this.entries[n - 2].position)
  }

  clear () {
    this.entries = []
  }
}

/** No rival position seen yet: no velocity, a window of one tick (see trackRival). */
function freshMotion () {
  return { updates: [], window: 1, vel: new Vec3(0, 0, 0) }
}

function between (range, rng) {
  return range[0] + rng() * (range[1] - range[0])
}

/**
 * Reach the way the server measures it: from the attacker's eye (feet + 1.62) to the closest point
 * of the target's box. Every tactical distance of the engine uses it, so REACH 3.0 means the same
 * thing in the plan and in the swing.
 */
function reachBetween (attacker, target, width = 0.6, height = 1.8) {
  const eyeY = attacker.y + EYE_HEIGHT
  const half = width / 2
  const dx = Math.max(target.x - half - attacker.x, 0, attacker.x - (target.x + half))
  const dy = Math.max(target.y - eyeY, 0, eyeY - (target.y + height))
  const dz = Math.max(target.z - half - attacker.z, 0, attacker.z - (target.z + half))
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

// ---- The engine --------------------------------------------------------------------------------

class CombatEngine {
  /**
   * @param bot mineflayer bot
   * @param options { getTarget(): Entity|null, shieldAllowed(): boolean, paused(): boolean, log(msg),
   *   onAttack(kind), now?(): ms, rng?(): number, memory?: RivalMemory, opponentName?(): string }
   */
  constructor (bot, options) {
    this.bot = bot
    this.options = options
    this.now = options.now || Date.now
    this.rng = options.rng || Math.random
    this.memory = options.memory || null
    this.level = 'normal'
    this.mode = null // 'pelea' | 'muevete' | null
    this.history = new PositionHistory(40)
    this.tick = 0
    this.lastAttackTick = -100
    this.cycle = null
    this.strafe = { dir: null, until: 0, dodgedAt: -100, reason: '' }
    this.wtapUntil = 0
    this.stapUntil = 0
    this.forceJumpReset = false
    this.aimOffset = { x: 0, y: 0.7, z: 0, until: 0 }
    this.reactionMs = 180
    this.reactionUntil = 0
    this.shieldUp = false
    this.shieldDownTick = -100
    // When the shield went up, and until when it rests after a long block (see SHIELD_MAX_UP)
    this.shieldUpTick = -100
    this.shieldRestUntil = -100
    this.targetSwingTick = -100
    this.swapping = false
    this.warnedNoWeapon = false
    this.stats = { hits: 0, crits: 0, sprintHits: 0, air: 0 }
    // What the rival does, learned during the fight (and remembered between fights)
    this.model = new OpponentModel()
    this.rivalInfo = { name: null, fights: 0 }
    this.lastSaveTick = 0
    // The rival's position updates as the bot receives them, and its velocity (see trackRival)
    this.rivalMotion = freshMotion()
    this.distanceLog = []
    // Per-tick speed of the rival toward the bot (positive while it comes in), and the start of a wait for it
    this.closingLog = []
    this.waitStart = null
    // Gaps between the rival's swings, in ticks (its rhythm as the engine sees it)
    this.swingGaps = []
    this.comboFor = 0
    this.comboAgainst = 0
    this.comboBrokenAt = 0
    this.lastHit = null
    this.lastTargetHurtTick = -100
    this.lastSelfHurtTick = -100
    // Sprint as the server sees it: it only counts again after the key was released and pressed
    this.sprintOn = false
    this.sprintPrimed = false
    this.sprintChangedTick = -100
    // The last position packets (what the server knows of the bot), see serverView
    this.sentPos = null
    this.prevSentPos = null
    this.sentOnGround = false
    this.intent = null
    this.plan = []
    // The tick of an attack made with the axe: the sword goes back in hand on a later tick
    this.swordAfterTick = null
    // The remembered rival shown while not fighting (read whole, never saved from here)
    this.remembered = null
  }

  get settings () {
    return LEVELS[this.level] || LEVELS.normal
  }

  /**
   * Starts a mode. Only a fight ('pelea') loads, teaches and saves the rival memory: moving around the
   * owner without hitting ('muevete') would teach nothing useful and would halve the stored model.
   */
  start (mode) {
    this.stop()
    this.mode = mode
    this.history.clear()
    this.rivalMotion = freshMotion()
    this.distanceLog = []
    this.closingLog = []
    this.waitStart = null
    this.swingGaps = []
    this.targetSwingTick = -100
    this.cycle = null
    this.warnedNoWeapon = false
    this.comboFor = 0
    this.comboAgainst = 0
    this.comboBrokenAt = 0
    this.plan = []
    if (mode === 'pelea') this.loadModel()
    this.lastSaveTick = this.tick
  }

  stop () {
    if (this.mode) this.saveModel(this.mode === 'pelea')
    this.mode = null
    this.plan = []
    this.releaseControls()
  }

  /**
   * The server moved the bot (a teleport or a respawn): what it knows of the bot is the new position,
   * and the distances and rival positions logged before the jump mean nothing now.
   */
  resync () {
    const e = this.bot.entity
    if (e && e.position) {
      this.sentPos = e.position.clone()
      this.prevSentPos = e.position.clone()
      this.sentOnGround = Boolean(e.onGround)
    }
    this.distanceLog = []
    this.closingLog = []
    this.waitStart = null
    this.history.clear()
    this.rivalMotion = freshMotion()
  }

  releaseControls () {
    this.lowerShield()
    for (const control of CONTROLS) this.bot.setControlState(control, false)
    if (this.sprintOn) this.sprintChangedTick = this.tick
    this.sprintOn = false
    this.sprintPrimed = false
  }

  /** Hits, crits, sprint hits and swings at the air since the last call (diagnostics). */
  takeStats () {
    const stats = this.stats
    this.stats = { hits: 0, crits: 0, sprintHits: 0, air: 0 }
    return stats
  }

  /** 1.9+ attack charge of the held weapon (0..1), what the panel's frame meter draws. */
  charge () {
    const cooldown = cooldownTicks(this.bot.heldItem && this.bot.heldItem.name)
    const sinceAttack = this.tick - this.lastAttackTick
    return { value: Math.max(0, Math.min(1, sinceAttack / cooldown)), cooldown, sinceAttack }
  }

  /** Tells the listener (the panel) about a swing: 'crit', 'sprint', 'hit' or 'air'. */
  report (kind) {
    if (this.options.onAttack) this.options.onAttack(kind)
  }

  // ---- Memory and the rival reading ------------------------------------------------------------

  opponentName () {
    const name = this.options.opponentName ? this.options.opponentName() : null
    return name ? String(name) : null
  }

  loadModel () {
    this.remembered = null
    const name = this.opponentName()
    if (this.memory && name) {
      this.model = this.memory.load(name)
      const info = this.memory.info(name)
      this.rivalInfo = { name, fights: info ? info.fights : 0 }
    } else {
      if (this.rivalInfo.name !== name) this.model = new OpponentModel()
      this.rivalInfo = { name, fights: this.rivalInfo.name === name ? this.rivalInfo.fights : 0 }
    }
  }

  /** Saves what was learned; only a fight saves (see start). fightEnded counts one more fight. */
  saveModel (fightEnded) {
    const name = this.opponentName()
    if (!this.memory || !name || this.mode !== 'pelea') return
    if (this.memory.save(name, this.model, { fightEnded }) && fightEnded) {
      this.rivalInfo = { name, fights: (this.rivalInfo.name === name ? this.rivalInfo.fights : 0) + 1 }
    }
    this.remembered = null
    this.lastSaveTick = this.tick
  }

  /**
   * What the bot knows about its rival and why it plays the way it plays right now (panel). Outside a
   * fight it shows the remembered rival, read whole and only for display (never halved, never saved).
   */
  rivalSummary () {
    const name = this.opponentName()
    const remembered = this.mode === 'pelea' ? null : this.rememberedModel(name)
    return {
      name: name || '',
      fights: this.rivalInfo.name === name ? this.rivalInfo.fights : 0,
      summary: (remembered || this.model).summary(),
      plan: this.plan.slice(0, MAX_REASONS)
    }
  }

  /** The stored model of the rival (cached until the next load, save or forget), or null without memory. */
  rememberedModel (name) {
    if (!this.memory || !name) return null
    if (!this.remembered || this.remembered.name !== name) {
      if (this.rivalInfo.name !== name) {
        const info = this.memory.info(name)
        this.rivalInfo = { name, fights: info ? info.fights : 0 }
      }
      this.remembered = { name, model: this.memory.load(name, { asPrior: false }) }
    }
    return this.remembered.model
  }

  /** Forgets everything learned about the current rival, on disk too. False when the disk failed. */
  forgetOpponent () {
    const name = this.opponentName()
    const known = Boolean(this.memory && name && this.memory.info(name))
    const forgotten = known ? this.memory.forget(name) : true
    this.model = new OpponentModel()
    this.rivalInfo = { name, fights: 0 }
    this.remembered = null
    return forgotten
  }

  // ---- Events ----------------------------------------------------------------------------------

  /** The target swung its arm: it may hit soon, a reason to dodge (and a beat of its rhythm). */
  onTargetSwing () {
    const gap = this.tick - this.targetSwingTick
    this.targetSwingTick = this.tick
    if (!this.mode) return
    if (this.mode === 'pelea') this.model.observeSwing(this.tick)
    if (gap > 0 && gap <= MAX_SWING_GAP) {
      this.swingGaps.push(gap)
      if (this.swingGaps.length > SWING_GAPS_KEPT) this.swingGaps.shift()
    }
    if (this.rng() < this.settings.dodgeChance) {
      this.strafe = {
        dir: this.strafe.dir === 'left' ? 'right' : 'left',
        until: this.tick + 8 + Math.floor(this.rng() * 12),
        dodgedAt: this.tick,
        reason: 'Esquiva: acabas de atacar'
      }
    }
  }

  /**
   * The bot got knockback. In the game this runs from the velocity packet (knockback.js), before the
   * next physics tick moves the bot: a jump pressed right here is the very next move, on the
   * knockback tick, which is a real jump reset. It is pressed when the level knows the trick
   * (jumpResetChance), when a combo break forces it, or with an edge behind (less push toward the
   * void); only on the ground, and never while paused (eating: no decision would release the key).
   * The next decision releases it.
   */
  onHurt () {
    if (!this.mode || this.options.paused()) return
    const e = this.bot.entity
    // In the air there is nothing to reset; a forced reset waits for the next hit on the ground
    if (!e || !e.onGround) return
    const forced = this.forceJumpReset
    this.forceJumpReset = false
    if (forced || this.edgeBehind() || this.rng() < this.settings.jumpResetChance) {
      this.bot.setControlState('jump', true)
    }
  }

  /** Little open ground behind the bot (along the rival→bot line, where knockback pushes). */
  edgeBehind () {
    const target = this.options.getTarget()
    const room = target && target.position ? this.roomBehind(target) : null
    return room !== null && room < EDGE_ROOM + EDGE_SOFT
  }

  /** Our hit was confirmed: the knockback measurement starts and the combo goes on. */
  onTargetHurt () {
    const target = this.options.getTarget()
    const hit = this.lastHit && this.tick - this.lastHit.tick <= 10 ? this.lastHit : null
    // The knockback flight shows up in later position updates: the model times it from there
    if (this.mode === 'pelea' && target && target.position) {
      this.model.observeHitLanded({
        tick: this.tick,
        sprintHit: Boolean(hit && hit.sprint),
        targetPos: target.position,
        targetOnGround: Boolean(target.onGround)
      })
    }
    this.lastTargetHurtTick = this.tick
    this.comboFor++
    this.comboAgainst = 0
  }

  /**
   * The bot took damage. Only a hit from the rival during a fight teaches its reach and its crits: on
   * 1.20+ fall, fire and lava damage arrive without a source too (and are passed as byTarget), so a
   * hurt farther than RIVAL_HIT_RANGE from the rival is not its hit. The combo counters still move.
   */
  onSelfHurt ({ byTarget } = {}) {
    this.lastSelfHurtTick = this.tick
    if (!byTarget) return
    const target = this.options.getTarget()
    const e = this.bot.entity
    if (this.mode === 'pelea' && target && target.position && e) {
      // Measured where the server held the bot when it resolved the swing, like the server did
      const held = this.heldForRivalSwing()
      const apart = Math.hypot(target.position.x - held.x, target.position.z - held.z)
      if (apart <= RIVAL_HIT_RANGE) {
        const vel = this.targetVelocity()
        this.model.observeHitTaken({
          tick: this.tick,
          distance: reachBetween(target.position, held),
          targetFalling: !target.onGround && vel.y < 0
        })
      }
    }
    this.comboAgainst++
    this.comboFor = 0
  }

  /**
   * Where the server held the bot when it resolved a rival swing whose news (the swing, the hurt)
   * arrives now. Events come between ticks, after this tick's position packet went out; the server
   * judged the swing before that packet reached it, so against the previous one (with more ping an even
   * older one, never a newer one).
   */
  heldForRivalSwing () {
    return this.prevSentPos || this.sentPos || this.bot.entity.position
  }

  // ---- The tick --------------------------------------------------------------------------------

  /**
   * One physics tick. mineflayer moves the bot BEFORE this event and sends the position packet AFTER
   * it, while every packet sent from here (sprint, attack) goes out at once: the server judges this
   * tick's swing from the position of the previous packet (see serverView).
   */
  onPhysicsTick () {
    this.tick++
    this.play()
    this.rememberSent()
  }

  /** What the position packet of this tick carries (sent right after this handler). */
  rememberSent () {
    const e = this.bot.entity
    if (!e || !e.position) return
    this.prevSentPos = this.sentPos
    this.sentPos = e.position.clone()
    this.sentOnGround = Boolean(e.onGround)
  }

  /**
   * The bot as the server knows it while this tick's packets arrive: the last position packet, its
   * vertical change and its onGround. The server's fall distance only grows with a downward move it
   * received, so a crit needs `falling` here, not in the client's newer state.
   */
  serverView () {
    const e = this.bot.entity
    const pos = this.sentPos || e.position
    const dy = this.sentPos && this.prevSentPos ? this.sentPos.y - this.prevSentPos.y : 0
    const onGround = this.sentPos ? this.sentOnGround : Boolean(e.onGround)
    return { pos, dy, onGround, falling: !onGround && dy < 0 }
  }

  play () {
    if (!this.mode || this.options.paused()) return
    const target = this.options.getTarget()
    if (!target || !target.isValid) {
      // The target died, left or is out of sight: wait for him, still in the same mode
      this.releaseControls()
      this.history.clear()
      this.rivalMotion = freshMotion()
      this.distanceLog = []
      this.closingLog = []
      this.waitStart = null
      return
    }
    const now = this.now()
    this.history.push(now, target.position)
    this.trackRival(target)
    if (this.mode === 'pelea') {
      this.swordBack()
      this.ensureWeapon()
    }
    const ctx = this.context(target)
    if (this.mode === 'pelea') this.observe(target, ctx)
    this.aim(target, now, ctx.view)
    if (this.mode === 'pelea') {
      this.applyControls(this.decide(target, ctx))
      this.fight(target, ctx)
      if (this.memory && this.tick - this.lastSaveTick >= SAVE_EVERY) this.saveModel(false)
    } else {
      this.applyControls(this.wander(ctx))
    }
  }

  /**
   * A new position of the rival arrived (it differs from the last one): its velocity is the change
   * over a window of the latest updates divided by the ticks between them, never the change of one
   * tick. Positions come every tick in the simulator (the window is that one tick, exact), every 2 ticks
   * on a server and with network jitter: there the window spans two usual gaps, so one late or early
   * update does not read as a stop or a double speed. Between updates the velocity holds; when no
   * update comes for longer than the window the rival stopped (a server sends nothing then): zero.
   */
  trackRival (target) {
    const motion = this.rivalMotion
    const pos = target.position
    const updates = motion.updates
    const last = updates[updates.length - 1]
    if (last && pos.x === last.pos.x && pos.y === last.pos.y && pos.z === last.pos.z) {
      if (this.tick - last.tick > motion.window) motion.vel = new Vec3(0, 0, 0)
      return
    }
    updates.push({ tick: this.tick, pos: pos.clone() })
    if (updates.length > RIVAL_UPDATES_KEPT) updates.shift()
    if (updates.length < 2) return
    // The usual gap is the mean one: jitter can bring three updates on consecutive ticks, so a median
    // would read a 2-tick source as a per-tick one
    let sum = 0
    for (let i = 1; i < updates.length; i++) sum += Math.min(RIVAL_MAX_GAP, updates[i].tick - updates[i - 1].tick)
    const gap = Math.max(1, Math.round(sum / (updates.length - 1)))
    motion.window = gap === 1 ? 1 : 2 * gap
    let ref = updates[0]
    for (let i = updates.length - 2; i >= 0; i--) {
      if (this.tick - updates[i].tick >= motion.window) {
        ref = updates[i]
        break
      }
    }
    // After a long stand-still the move covers at most a couple of windows, not the whole pause
    const ticks = Math.max(1, Math.min(2 * RIVAL_MAX_GAP, this.tick - ref.tick))
    motion.vel = pos.minus(ref.pos).scaled(1 / ticks)
  }

  /**
   * Ticks until the rival's sword is charged again, or null while its rhythm is unknown. The model's
   * median swing gap is stretched by the times it waited out of reach; how soon it CAN swing again is
   * its quick gaps (a low percentile), so that is what the shield, the dodge and the spacing use.
   */
  enemyReadyIn () {
    const gaps = this.swingGaps
    if (gaps.length < MIN_RHYTHM_GAPS) return this.model.enemyReadyIn(this.tick)
    const sorted = gaps.slice().sort((a, b) => a - b)
    const quick = sorted[Math.floor(sorted.length * QUICK_GAP_PERCENTILE)]
    return Math.max(0, quick - (this.tick - this.targetSwingTick))
  }

  /**
   * Whether to let the rival come instead of walking to it: it really approaches (its own velocity
   * toward the bot above CLOSING_FAST in at least 3 of the last 4 ticks; the bot's own steps do not
   * count, and the velocity holds between the 2-tick updates of a server) or it is flying back from our
   * own knockback. A hop or a jitter is not an approach, and no wait lasts more than WAIT_MAX ticks.
   */
  waitFor (target) {
    const approaching = this.closingLog.filter((delta) => delta > CLOSING_FAST).length >= 3
    const flyingFromOurHit = !target.onGround && this.tick - this.lastTargetHurtTick <= KB_FLIGHT_TICKS
    if (!approaching && !flyingFromOurHit) {
      this.waitStart = null
      return false
    }
    if (this.waitStart === null) this.waitStart = this.tick
    return this.tick - this.waitStart < WAIT_MAX
  }

  /** Movement per tick of the target, from its position updates (see trackRival). */
  targetVelocity () {
    return this.rivalMotion.vel
  }

  context (target) {
    const bot = this.bot
    const width = target.width || 0.6
    const height = target.height || 1.8
    // Both reaches as the server measures them, from the bot's last position packet: ours to the rival,
    // and the rival's to us (its swings of this tick are resolved against that packet, not against the
    // move the bot just made)
    const view = this.serverView()
    const distance = reachBetween(view.pos, target.position, width, height)
    const enemyDistance = reachBetween(target.position, view.pos)
    // How fast the rival itself comes in (its velocity toward the bot): smooth under the 2-tick
    // updates of a server, and blind to the bot's own steps
    const toBotX = view.pos.x - target.position.x
    const toBotZ = view.pos.z - target.position.z
    const apart = Math.hypot(toBotX, toBotZ)
    const vel = this.targetVelocity()
    this.closingLog.push(apart > 1e-6 ? (vel.x * toBotX + vel.z * toBotZ) / apart : 0)
    if (this.closingLog.length > 4) this.closingLog.shift()
    this.distanceLog.push(distance)
    if (this.distanceLog.length > 4) this.distanceLog.shift()
    const log = this.distanceLog
    // Positive while the gap shrinks
    const closingSpeed = log.length > 1 ? (log[0] - log[log.length - 1]) / (log.length - 1) : 0
    const summary = this.model.summary()
    const enemyReadyIn = this.enemyReadyIn()
    const base = { view, distance, enemyDistance, closingSpeed, summary, enemyReadyIn }
    if (!this.cycle) this.newCycle(base)
    const cooldown = cooldownTicks(bot.heldItem && bot.heldItem.name)
    const readyAt = cooldown + this.cycle.extra
    const sinceAttack = this.tick - this.lastAttackTick
    return { ...base, cooldown, readyAt, sinceAttack, untilReady: readyAt - sinceAttack }
  }

  /** What this recharge will look like: a crit or a sprint (knockback) hit, chosen by the tactics. */
  newCycle (ctx) {
    const s = this.settings
    const choice = tactics.chooseHitStyle({
      distance: ctx.distance, closingSpeed: ctx.closingSpeed, comboFor: this.comboFor, comboAgainst: this.comboAgainst
    }, ctx.summary, s, this.rng)
    // A spam-clicker hits with little charge: this recharge the bot stands in and trades charged hits
    const trade = tactics.planTrade(ctx.summary, s, this.rng)
    this.cycle = {
      style: choice.style,
      reason: choice.reason,
      trade: trade.trade,
      tradeReason: trade.reason,
      extra: Math.round(between(s.extraCooldown, this.rng)),
      jumped: false,
      space: this.rng() < s.spacingChance,
      shield: this.rng() < s.shieldChance
    }
  }

  observe (target, ctx) {
    const botPos = this.bot.entity.position
    const look = typeof target.headYaw === 'number' ? target.headYaw : target.yaw
    let targetAimError = null
    if (typeof look === 'number') {
      const toBot = Math.atan2(-(botPos.x - target.position.x), -(botPos.z - target.position.z))
      targetAimError = wrapAngle(look - toBot)
    }
    this.model.observeTick({
      tick: this.tick,
      distance: ctx.distance,
      targetPos: target.position,
      targetVel: this.targetVelocity(),
      targetOnGround: Boolean(target.onGround),
      targetBlocking: this.isBlocking(target),
      botPos,
      botStrafe: this.strafe.dir,
      targetAimError
    })
  }

  ensureWeapon () {
    if (this.swapping || isWeapon(this.bot.heldItem)) return
    const weapon = this.bestItem((item) => item.name.endsWith('_sword')) || this.bestItem((item) => item.name.endsWith('_axe'))
    if (weapon) {
      this.swap(weapon)
    } else if (!this.warnedNoWeapon) {
      this.warnedNoWeapon = true
      if (this.options.log) this.options.log('No tengo espada ni hacha: dame una (a puño pego rápido, como en 1.8).')
    }
  }

  // ---- Aim -------------------------------------------------------------------------------------

  /**
   * Aims from the eye the server knows (the last position packet): a vanilla client also picks its
   * target before moving, from where it stood at the end of the previous tick.
   */
  aim (target, now, view) {
    const s = this.settings
    if (now > this.reactionUntil) {
      // A person's reaction time drifts: pick a new one every couple of seconds
      this.reactionMs = between(s.reactionMs, this.rng)
      this.reactionUntil = now + 1500 + this.rng() * 2000
    }
    if (this.tick > this.aimOffset.until) {
      // Aims at a spot of the body, not at its exact center, and the spot wanders
      const width = target.width || 0.6
      this.aimOffset = {
        x: (this.rng() * 2 - 1) * width * 0.25,
        y: 0.55 + this.rng() * 0.3,
        z: (this.rng() * 2 - 1) * width * 0.25,
        lead: between(s.leadTicks, this.rng),
        until: this.tick + 10 + Math.floor(this.rng() * 20)
      }
    }
    // What it saw a reaction time ago, pushed forward along the target's motion (tracking)
    const seen = this.history.at(now - this.reactionMs) || target.position
    const lead = this.targetVelocity().scaled(this.aimOffset.lead || 0)
    const height = target.height || 1.8
    const point = seen.plus(lead).offset(this.aimOffset.x, height * this.aimOffset.y, this.aimOffset.z)
    // Between the eye the server knows and the current one: the swing must cross the box from both
    const here = this.bot.entity.position
    const from = view ? view.pos.plus(here).scaled(0.5) : here
    const eye = from.offset(0, EYE_HEIGHT, 0)
    const wanted = anglesTo(eye, point)
    let fraction = between(s.turnFraction, this.rng)
    if (this.rng() < 0.03) fraction = 1.15 // an overshoot now and then, corrected on the next ticks
    const next = aimStep({ yaw: this.bot.entity.yaw, pitch: this.bot.entity.pitch }, wanted, fraction,
      s.maxTurnDeg * DEG, s.jitterDeg * DEG, this.rng)
    this.bot.look(next.yaw, next.pitch, true).catch(() => {})
  }

  /**
   * The crosshair is on the target's box within reach right now, both from the eye the server knows
   * (what it validates the swing against) and from the current eye (what the client sees).
   */
  inSight (target) {
    const e = this.bot.entity
    const box = entityBox(target.position, target.width || 0.6, target.height || 1.8)
    const sentEye = this.serverView().pos.offset(0, EYE_HEIGHT, 0)
    const eye = e.position.offset(0, EYE_HEIGHT, 0)
    return rayHitsBox(sentEye, e.yaw, e.pitch, box, REACH) && rayHitsBox(eye, e.yaw, e.pitch, box, REACH)
  }

  // ---- Decisions -------------------------------------------------------------------------------

  /** The controls of this tick in a fight, plus the attack intent (this.intent) and the reasons. */
  decide (target, ctx) {
    const e = this.bot.entity
    const cycle = this.cycle
    const c = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
    const reasons = { edge: '', combo: '', shield: '', after: '', style: '', move: '', strafe: '' }
    const enemyReach = tactics.enemyReachOf(ctx.summary)
    this.intent = null

    // Open ground behind the bot, where the rival's hits push it
    const room = this.roomBehind(target)
    const edge = { room, near: room !== null && room < EDGE_ROOM, aware: room !== null && room < EDGE_ROOM + EDGE_SOFT }

    // Landed after the crit jump without hitting: the cycle can plan another jump
    if (cycle.jumped && e.onGround && this.tick > cycle.jumpTick + 1) cycle.jumped = false

    reasons.style = cycle.reason
    const backingOff = this.distancePlan(target, ctx, c, reasons, edge, enemyReach)
    const holdForCrit = this.critPlan(ctx, c, reasons, edge, enemyReach)
    this.afterHitPlan(c, reasons)
    this.strafePlan(target, ctx, c, reasons, edge, backingOff)
    this.edgePlan(target, c, reasons, edge)
    const wantShield = this.shieldPlan(ctx, c, reasons, edge, enemyReach)
    this.chooseSwing(target, ctx, c, reasons, wantShield, holdForCrit)
    if (this.intent) {
      this.stapUntil = Math.min(this.stapUntil, this.tick)
      this.wtapUntil = Math.min(this.wtapUntil, this.tick)
    }

    if (wantShield && !this.intent) this.raiseShield()
    else this.lowerShield()
    if (this.shieldUp) {
      // Vanilla slows a player using an item to 20 % (prismarine-physics does not): stand still
      c.forward = false
      c.back = false
      c.left = false
      c.right = false
      c.sprint = false
    }

    this.plan = [reasons.edge, reasons.combo, reasons.shield, reasons.after, reasons.style, reasons.move, reasons.strafe]
      .filter((reason, index, all) => reason && all.indexOf(reason) === index).slice(0, MAX_REASONS)
    return c
  }

  /**
   * Distance: chase, or the reach dance while the sword recharges. A rival over the void (it fell or
   * is about to) is never followed to the edge: the bot waits for it on open ground. Returns whether
   * the bot is backing off from a rival that comes in (no strafe then: it would slow the retreat).
   */
  distancePlan (target, ctx, c, reasons, edge, enemyReach) {
    const s = this.settings
    const cycle = this.cycle
    if (ctx.distance > CHASE_DISTANCE && this.overVoid(target.position)) {
      Object.assign(c, this.towardOpenGround())
      reasons.move = 'Te espero lejos del borde'
      return false
    }
    if (ctx.distance > CHASE_DISTANCE) {
      // A rival flying back from our knockback, or really coming, is waited for, not chased
      if (ctx.distance < CHASE_WAIT && this.waitFor(target)) {
        reasons.move = 'Te espero: vuelves tú'
        return false
      }
      c.forward = true
      c.sprint = true
      reasons.move = 'Sprint: estás lejos, hay que entrar'
      return false
    }
    if (cycle.trade) {
      // Trading with a spam-clicker: no holding back, no retreat; in to the hit distance
      c.forward = ctx.distance > s.hitDistance
      c.sprint = c.forward && cycle.style === 'sprint'
      reasons.move = cycle.tradeReason
      return false
    }
    if (!cycle.space && ctx.untilReady > 3) {
      // No spacing this recharge: just stay close
      c.forward = ctx.distance > s.hitDistance
      reasons.move = 'Me quedo cerca'
      return false
    }
    const spacing = tactics.planSpacing({
      distance: ctx.distance, untilReady: ctx.untilReady, enemyReadyIn: ctx.enemyReadyIn, style: cycle.style
    }, ctx.summary, s)
    c.forward = spacing.forward
    c.back = spacing.back
    c.sprint = spacing.sprint
    reasons.move = spacing.reason
    // Waiting for the charge: a rival that is coming back by itself (flying from our knockback, or
    // closing in) is not walked to; every step it takes toward us is time for our sword
    if (spacing.forward && ctx.untilReady > 3 && this.waitFor(target)) {
      c.forward = false
      c.sprint = false
      reasons.move = 'Te espero: vuelves tú'
    }
    // A rival that comes in while the sword recharges: back off before it is in reach
    const hold = Math.max(enemyReach, REACH) + s.holdMargin
    const incoming = !edge.aware && ctx.closingSpeed > CLOSING_FAST && ctx.distance < hold + 0.3
    if (incoming && ctx.untilReady > 0) {
      c.forward = false
      c.sprint = false
      c.back = true
      reasons.move = 'Atrás: vienes y aún no he cargado'
    }
    // Sprint hit coming: hold forward and sprint a tick ahead, the key must not change on the swing
    // (only on the ground: in the air the swing is a crit, which needs the sprint off)
    const grounded = this.bot.entity.onGround && ctx.view.onGround
    if (grounded && cycle.style === 'sprint' && ctx.untilReady <= 1 && ctx.distance <= REACH + 0.5) {
      c.forward = true
      c.back = false
      c.sprint = true
    }
    return c.back && ctx.closingSpeed > CLOSING_FAST
  }

  /**
   * Crit: jump so the fall meets the charge; never sprint into it, never jump into its hit. The
   * server sees each move one tick late, so the swing window is one tick later than the physics
   * window: the jump goes one tick before the plan says. Returns whether a plain hit must wait for it.
   */
  critPlan (ctx, c, reasons, edge, enemyReach) {
    const s = this.settings
    const e = this.bot.entity
    const cycle = this.cycle
    const ready = ctx.untilReady <= 0
    if (cycle.style !== 'crit') return false
    let holdForCrit = false
    if (e.onGround && !cycle.jumped) {
      let plan = tactics.planCrit({ untilReady: ctx.untilReady, distance: ctx.distance, closingSpeed: ctx.closingSpeed }, s, this.rng)
      if (plan) {
        // The fall must meet it at a sane range: not under it, not past the reach seen from above
        const predicted = ctx.distance - ctx.closingSpeed * plan.attackAt
        if (predicted < s.hitDistance - CRIT_CLOSE_MARGIN || predicted > CRIT_MAX_REACH) plan = null
      }
      if (plan) {
        // Its sword ready and in its reach before our fall: the jump would just eat its hit
        const enemyCharged = ctx.enemyReadyIn === null || ctx.enemyReadyIn < plan.attackAt
        const enemyArrives = ctx.enemyDistance - Math.max(0, ctx.closingSpeed) * plan.attackAt <= enemyReach + 0.1
        // (trading with a spam-clicker accepts its weak hit)
        const unsafe = edge.aware || (!cycle.trade && enemyCharged && enemyArrives)
        if (!unsafe && plan.jumpIn <= SERVER_LAG_TICKS) {
          c.jump = true
          cycle.jumped = true
          cycle.jumpTick = this.tick
          holdForCrit = true
          reasons.style = `${cycle.reason} · salto ahora`
        } else if (!unsafe) {
          // The jump is a tick or two away: do not waste the crit with a plain hit now
          holdForCrit = ready && plan.jumpIn <= 2
        } else if (ready) {
          cycle.style = 'sprint'
          cycle.reason = edge.aware ? 'Sprint: cerca del borde no salto' : 'Sprint: me pegarías en el aire'
          reasons.style = cycle.reason
        }
      } else if (ready) {
        cycle.style = 'sprint'
        cycle.reason = 'Sprint: no llego al crítico'
        reasons.style = cycle.reason
      }
    }
    if (cycle.style === 'crit') {
      if (ctx.distance <= CHASE_DISTANCE) c.sprint = false
      if (!e.onGround && cycle.jumped) {
        // Drift into reach while falling, without sprint
        c.forward = ctx.distance > s.hitDistance
        c.back = false
        c.sprint = false
      }
    }
    return holdForCrit
  }

  /** After a hit: s-tap out of reach, or w-tap so the sprint counts again (see planAfterHit). */
  afterHitPlan (c, reasons) {
    if (this.tick < this.stapUntil) {
      c.forward = false
      c.sprint = false
      c.back = true
      reasons.after = this.afterReason
    } else if (this.tick < this.wtapUntil) {
      c.forward = false
      c.sprint = false
      reasons.after = this.afterReason
    }
  }

  /** Strafe (dodge when its sword is charged, otherwise the planned side) and the combo break. */
  strafePlan (target, ctx, c, reasons, edge, backingOff) {
    const previousStrafe = this.strafe
    this.strafe = tactics.planStrafe({ tick: this.tick, enemyReadyIn: ctx.enemyReadyIn }, ctx.summary, this.settings, this.rng, this.strafe)
    if (edge.aware && this.strafe.until !== previousStrafe.until && this.strafe.dodgedAt !== this.tick) {
      // A new strafe near an edge goes to the side that leaves more ground behind
      const side = this.saferSide(target)
      if (side) this.strafe = { ...this.strafe, dir: side, reason: 'Strafe hacia el centro' }
    }
    reasons.strafe = this.strafe.reason

    // Combo break: two hits taken in a row
    const combo = tactics.comboBreak({ comboAgainst: this.comboAgainst })
    if (combo.active) {
      reasons.combo = combo.reason
      if (this.comboAgainst > this.comboBrokenAt) {
        // The sure jump reset is spent once per combo; the s-tap and the side switch every hit
        if (this.comboBrokenAt === 0) this.forceJumpReset = true
        this.comboBrokenAt = this.comboAgainst
        this.stapUntil = this.tick + 3
        this.afterReason = 'S-tap: rompo tu combo'
        this.strafe = {
          dir: this.strafe.dir === 'left' ? 'right' : 'left',
          until: this.tick + 8 + Math.floor(this.rng() * 10),
          dodgedAt: this.tick,
          reason: 'Cambio de lado para romper el combo'
        }
        c.forward = false
        c.sprint = false
        c.back = true
        reasons.after = this.afterReason
      }
    } else {
      this.comboBrokenAt = 0
    }
    c.left = !backingOff && this.strafe.dir === 'left'
    c.right = !backingOff && this.strafe.dir === 'right'
  }

  /**
   * Edges: keep open ground behind (where its hits push), circling toward the safe side, and when
   * knocked into the air near one, hold forward toward the rival (vanilla air control takes part of
   * the knockback back).
   */
  edgePlan (target, c, reasons, edge) {
    if (edge.near) {
      // Never fight with the back to the void: circle back toward the open ground (the centre), so
      // the rival's knockback points inward. Strafe to the side that leads inward, step forward when
      // that is inward too, and never back up
      const keys = this.inwardKeys()
      if (keys) {
        c.left = keys.left
        c.right = keys.right
        if (edge.room < EDGE_BACK && keys.forward) c.forward = true
      } else {
        const side = this.saferSide(target)
        if (side) {
          c.left = side === 'left'
          c.right = side === 'right'
        }
      }
      c.back = false
      if (edge.room < EDGE_BACK) {
        c.sprint = false
        reasons.edge = 'Giro hacia el centro: tengo el vacío detrás'
      } else {
        reasons.edge = 'Me alejo del borde'
      }
    }
    const flying = !this.bot.entity.onGround && this.tick - this.lastSelfHurtTick <= KB_FLIGHT_TICKS
    if (flying && edge.aware) {
      c.forward = true
      c.back = false
      c.left = false
      c.right = false
      reasons.move = 'Aguanto el KB hacia ti: hay borde detrás'
    }
    // In the air a swing can only be a crit, and a crit needs the sprint key already off
    if (!this.bot.entity.onGround) c.sprint = false
  }

  /**
   * Shield: up when its hit is coming and ours is not ready (rolled once per recharge; always near an
   * edge, where a blocked hit pushes nothing). A vanilla shield blocks only after SHIELD_WARMUP + 1
   * ticks of use, so it goes up that early, judged where the rival will be when it swings. A good
   * reader keeps it for charged swings: a spam click hurts little and its knockback is a free crit.
   */
  shieldPlan (ctx, c, reasons, edge, enemyReach) {
    const s = this.settings
    const offHand = this.bot.inventory && this.bot.inventory.slots ? this.bot.inventory.slots[45] : null
    const canShield = Boolean(offHand && offHand.name === 'shield') &&
      Boolean(this.options.shieldAllowed && this.options.shieldAllowed())
    // Near an edge an unknown rhythm counts as a charged sword, but only while the rival is a threat
    // (coming in, or it swung lately): a rival that just stands there must not freeze the bot
    // behind its shield with its back to the void
    // Guarded: near an edge, or in the air with an edge within reach of a flight (a hit taken in the
    // air flies much farther, there is no ground friction on its first tick)
    const guarded = edge.near || (edge.aware && !this.bot.entity.onGround)
    const threat = ctx.closingSpeed > CLOSING_FAST || this.tick - this.targetSwingTick < EDGE_THREAT_TICKS
    // A rival standing idle is not winding up: its known rhythm, decayed to "ready" while it waits,
    // no longer says when its hit comes and must not hold the shield up (the guard above still covers
    // a rival that comes in or swung lately)
    const known = this.rivalIdle(ctx.summary) ? null : ctx.enemyReadyIn
    const readyIn = known === null ? (guarded && threat ? 0 : null) : known
    const shield = tactics.planShield({
      hasShield: canShield,
      shieldAllowed: canShield,
      enemyReadyIn: readyIn === null ? null : Math.max(0, readyIn - SHIELD_WARMUP),
      distance: Math.max(0, ctx.enemyDistance - Math.max(0, ctx.closingSpeed) * (SHIELD_WARMUP + 1)),
      // Guarded, a hit taken costs too much: the bot would rather block and swing a bit later
      untilReady: guarded ? Math.max(ctx.untilReady, SHIELD_DROP_TICKS + 1) : ctx.untilReady
    }, ctx.summary, s)
    const swingGap = this.tick - this.targetSwingTick + Math.max(0, readyIn ?? 0)
    const weakSwing = s.modelWeight >= READ_SWING_WEIGHT && swingGap < WEAK_SWING_GAP && !edge.aware
    // Never frozen behind it: after SHIELD_MAX_UP ticks up it comes down and rests SHIELD_REST ticks
    if (this.shieldUp && this.tick - this.shieldUpTick >= SHIELD_MAX_UP) this.shieldRestUntil = this.tick + SHIELD_REST
    const resting = this.tick < this.shieldRestUntil
    const wantShield = shield.active && (this.cycle.shield || guarded) && !weakSwing && !resting
    if (wantShield) {
      c.sprint = false
      reasons.shield = shield.reason
    }
    return wantShield
  }

  /**
   * The rival stands idle: no swing for more than twice its swing interval (at most RIVAL_IDLE_MAX
   * ticks, the longest gap that still counts as rhythm).
   */
  rivalIdle (summary) {
    const interval = summary.swingInterval
    const limit = interval ? Math.min(RIVAL_IDLE_MAX, 2 * interval) : RIVAL_IDLE_MAX
    return this.tick - this.targetSwingTick > limit
  }

  /**
   * The swing of this tick, when charged and the crosshair is on the box. Never while the shield is up
   * or was lowered less than SHIELD_DROP_TICKS ago (vanilla drops clicks while using an item). The
   * sprint key never changes in the tick of a swing (vanilla sends the attack first, mineflayer would
   * not): the sprint state the swing needs must already be there since last tick, otherwise the key
   * changes now and the swing waits for the next tick.
   */
  chooseSwing (target, ctx, c, reasons, wantShield, holdForCrit) {
    const e = this.bot.entity
    const view = ctx.view
    const shieldClear = !this.shieldUp && this.tick - this.shieldDownTick >= SHIELD_DROP_TICKS && !wantShield
    if (ctx.untilReady > 0 || !shieldClear || this.swapping || !this.inSight(target)) return
    const sprintWas = this.sprintOn

    if (!e.onGround || !view.onGround) {
      // In the air only a crit is worth it: the server must have received a downward move, and the
      // sprint must already be off
      if (!view.falling) return
      c.sprint = false
      if (sprintWas) {
        reasons.after = 'Suelto el sprint para el crítico'
        return
      }
      this.intent = 'attack'
      return
    }

    if (this.cycle.style === 'sprint') {
      c.forward = true
      c.back = false
      if (sprintWas && this.sprintPrimed) {
        c.sprint = true
        this.intent = 'attack'
      } else if (sprintWas) {
        c.sprint = false
        reasons.after = 'Suelto el sprint para que vuelva a contar'
      } else {
        c.sprint = true
        reasons.after = 'Pulso el sprint para el golpe'
      }
      return
    }

    if (holdForCrit) return
    // A plain hit: a spent sprint key would read as a failed sprint hit, so it goes first
    if (sprintWas && !this.sprintPrimed) {
      c.sprint = false
      reasons.after = 'Suelto el sprint para que vuelva a contar'
      return
    }
    c.sprint = sprintWas
    if (sprintWas) {
      c.forward = true
      c.back = false
    }
    this.intent = 'attack'
  }

  /** Moving target ('muevete'): 2.5 to 4 blocks around the owner, never hitting. */
  wander (ctx) {
    const d = ctx.distance
    const c = { forward: d > 3.7, back: d < 2.1, left: false, right: false, jump: false, sprint: d > 4.7, sneak: false }
    if (this.bot.entity.onGround && this.rng() < 0.02) c.jump = true
    if (this.tick >= this.strafe.until) {
      const roll = this.rng()
      this.strafe = {
        dir: roll < 0.46 ? 'left' : roll < 0.92 ? 'right' : null,
        until: this.tick + 10 + Math.floor(this.rng() * 20),
        dodgedAt: -100,
        reason: ''
      }
    }
    c.left = this.strafe.dir === 'left'
    c.right = this.strafe.dir === 'right'
    this.lowerShield()
    this.plan = []
    return c
  }

  /** Terrain filter, then every control set explicitly (never the extra keys of safeControls). */
  applyControls (wanted) {
    const bot = this.bot
    let c = wanted
    const blockAt = this.blockAtFn()
    if (blockAt) c = safeControls(wanted, { position: bot.entity.position, yaw: bot.entity.yaw, blockAt })
    const forward = Boolean(c.forward)
    const back = Boolean(c.back) && !forward
    const sprint = Boolean(c.sprint) && forward
    if (sprint !== this.sprintOn) this.sprintChangedTick = this.tick
    if (sprint && !this.sprintOn) this.sprintPrimed = true
    if (!sprint) this.sprintPrimed = false
    this.sprintOn = sprint
    bot.setControlState('forward', forward)
    bot.setControlState('back', back)
    bot.setControlState('left', Boolean(c.left) && !c.right)
    bot.setControlState('right', Boolean(c.right) && !c.left)
    bot.setControlState('jump', Boolean(c.jump))
    bot.setControlState('sprint', sprint)
    bot.setControlState('sneak', Boolean(c.sneak))
  }

  blockAtFn () {
    const bot = this.bot
    if (typeof bot.blockAt !== 'function') return null
    return (x, y, z) => {
      const block = bot.blockAt(new Vec3(x, y, z))
      return block ? { name: block.name, boundingBox: block.boundingBox } : null
    }
  }

  /** Open ground behind the bot along the rival→bot line (where its knockback pushes), or null. */
  roomBehind (target) {
    const pos = this.bot.entity.position
    const dx = pos.x - target.position.x
    const dz = pos.z - target.position.z
    const length = Math.hypot(dx, dz)
    if (length < 1e-6) return null
    return this.roomAlong(pos.x, pos.z, dx / length, dz / length)
  }

  roomAlong (x, z, dx, dz) {
    const blockAt = this.blockAtFn()
    if (!blockAt) return null
    const y = this.bot.entity.position.y
    for (let d = ROOM_STEP; d <= ROOM_SCAN; d += ROOM_STEP) {
      if (isDangerous(blockAt, x + dx * d, y, z + dz * d)) return d - ROOM_STEP
    }
    return ROOM_SCAN
  }

  /** True when there is no solid ground under that point (it fell or is falling off), false if unknown. */
  overVoid (position) {
    const blockAt = this.blockAtFn()
    if (!blockAt) return false
    const ground = Math.min(position.y, this.bot.entity.position.y)
    return isDangerous(blockAt, position.x, ground, position.z)
  }

  /**
   * Keys that walk toward the most open ground when the bot is closer than EDGE_ROOM to an edge in
   * any direction (8 directions scanned), or no keys when it already stands on open ground.
   */
  towardOpenGround () {
    const e = this.bot.entity
    const keys = { forward: false, back: false, left: false, right: false }
    let best = null
    let bestRoom = -1
    let worst = Infinity
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4
      const dir = { x: Math.cos(angle), z: Math.sin(angle) }
      const room = this.roomAlong(e.position.x, e.position.z, dir.x, dir.z)
      if (room === null) return keys
      worst = Math.min(worst, room)
      if (room > bestRoom) {
        bestRoom = room
        best = dir
      }
    }
    if (worst >= EDGE_ROOM || !best) return keys
    const vectors = moveVectors(e.yaw)
    for (const key of ['forward', 'back', 'left', 'right']) {
      keys[key] = vectors[key].x * best.x + vectors[key].z * best.z > 0.38
    }
    return keys
  }

  /**
   * Keys that lead toward the most open ground (8 directions scanned with isDangerous): the strafe
   * side whose direction points there, and forward when it does too. Null when unknown or when the
   * open ground is straight behind (no inward strafe or step).
   */
  inwardKeys () {
    const e = this.bot.entity
    let best = null
    let bestRoom = -1
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4
      const dir = { x: Math.cos(angle), z: Math.sin(angle) }
      const room = this.roomAlong(e.position.x, e.position.z, dir.x, dir.z)
      if (room === null) return null
      if (room > bestRoom) {
        bestRoom = room
        best = dir
      }
    }
    const v = moveVectors(e.yaw)
    const dot = (key) => v[key].x * best.x + v[key].z * best.z
    const left = dot('left')
    if (Math.abs(left) < INWARD_MIN && dot('forward') < INWARD_MIN) return null
    return {
      left: left >= INWARD_MIN,
      right: left <= -INWARD_MIN,
      forward: dot('forward') >= INWARD_MIN
    }
  }

  /** The strafe side that leaves more open ground behind the bot after circling a bit. */
  saferSide (target) {
    const e = this.bot.entity
    const sin = Math.sin(e.yaw)
    const cos = Math.cos(e.yaw)
    const sides = { left: { x: -cos, z: sin }, right: { x: cos, z: -sin } }
    let best = null
    let bestRoom = -1
    for (const side of ['left', 'right']) {
      const px = e.position.x + sides[side].x * 1.5
      const pz = e.position.z + sides[side].z * 1.5
      const dx = px - target.position.x
      const dz = pz - target.position.z
      const length = Math.hypot(dx, dz)
      if (length < 1e-6) continue
      const room = this.roomAlong(px, pz, dx / length, dz / length)
      if (room !== null && room > bestRoom) {
        bestRoom = room
        best = side
      }
    }
    return best
  }

  // ---- Fighting --------------------------------------------------------------------------------

  fight (target, ctx) {
    const bot = this.bot
    const s = this.settings
    // Safety net: a sprint change and a swing in one tick would reach the server in the wrong order
    if (this.swapping || this.sprintChangedTick === this.tick) return

    // The target blocks with a shield: the axe disables it (then back to the sword after the hit)
    if (this.isBlocking(target)) {
      const axe = this.bestItem((item) => item.name.endsWith('_axe'))
      if (axe && (!bot.heldItem || !bot.heldItem.name.endsWith('_axe'))) {
        this.swap(axe)
        return
      }
    }

    if (this.intent !== 'attack') {
      // Charged and close but the aim is off: a person sometimes clicks anyway
      if (ctx.untilReady <= 0 && bot.entity.onGround && !this.shieldUp && ctx.distance < REACH + 0.6 &&
        !this.inSight(target) && this.rng() < s.missChance * 0.3) this.swingAir()
      return
    }
    // Last check with the final look: never a hit without the crosshair on the box
    if (!this.inSight(target)) return
    if (this.rng() < s.missChance) {
      this.swingAir()
      return
    }

    // No sprint change this tick (see above): the key and its priming are last tick's, the server's
    const view = ctx.view
    const charge = Math.min(1, ctx.sinceAttack / ctx.cooldown)
    const sprintHit = this.sprintOn && this.sprintPrimed && charge > PHYS.CRIT_CHARGE
    const crit = canCrit({ charge, onGround: view.onGround, vy: view.dy, sprinting: this.sprintOn })
    this.lowerShield()
    bot.attack(target)
    this.stats.hits++
    if (crit) this.stats.crits++
    if (sprintHit) this.stats.sprintHits++
    this.report(crit ? 'crit' : sprintHit ? 'sprint' : 'hit')
    // The server drops the sprint after a sprint hit: it counts again only after a re-press
    if (sprintHit) this.sprintPrimed = false

    this.lastAttackTick = this.tick
    this.lastHit = { tick: this.tick, sprint: sprintHit, crit }
    // The next recharge first: whether it trades with a spam-clicker decides the after-hit move
    this.newCycle(ctx)
    this.planAfterHit(ctx, sprintHit)
    // Back to the sword after disabling a shield with the axe, on the next tick: a vanilla client never
    // sends a slot change after an attack in the same tick
    if (bot.heldItem && bot.heldItem.name.endsWith('_axe')) this.swordAfterTick = this.tick
  }

  /** The sword goes back in hand the tick after an axe hit (switching items resets the charge, see swap). */
  swordBack () {
    if (this.swordAfterTick === null || this.tick <= this.swordAfterTick || this.swapping) return
    this.swordAfterTick = null
    const sword = this.bestItem((item) => item.name.endsWith('_sword'))
    if (sword && this.bot.heldItem && this.bot.heldItem.name.endsWith('_axe')) this.swap(sword)
  }

  /**
   * W-tap / s-tap after the hit, from the knockback physics (or at random on the easy level). A
   * recharge that trades with a spam-clicker gets no s-tap to avoid its hit: trading is the point.
   */
  planAfterHit (ctx, sprintHit) {
    const s = this.settings
    const after = tactics.planAfterHit({
      sprintHit, distance: ctx.distance, cooldown: ctx.readyAt, enemyReadyIn: ctx.enemyReadyIn, trade: this.cycle.trade
    }, ctx.summary, s, this.rng)
    let wtap = after.wtap
    let stap = after.stap
    let reason = after.reason
    if (!s.predictKnockback) {
      // A level that does not read the knockback w-taps or s-taps by habit, not every time (a spent
      // sprint is still released for a tick before the next sprint hit, see decide)
      if (this.rng() >= s.wtapChance) {
        wtap = 0
        reason = ''
      }
      if (stap === 0 && !sprintHit && this.rng() < s.stapChance) {
        stap = 2 + Math.floor(this.rng() * 3)
        reason = 'S-tap al azar'
      }
    }
    // Precedence: an s-tap (it also releases forward and sprint, so it re-arms the sprint too), else
    // the w-tap
    if (stap > 0) this.stapUntil = this.tick + 1 + stap
    else if (wtap > 0) this.wtapUntil = this.tick + 1 + wtap
    this.afterReason = reason
  }

  swingAir () {
    this.bot.swingArm('right')
    this.stats.air++
    this.report('air')
    // A swing resets the 1.9+ charge, like a real click
    this.lastAttackTick = this.tick
    this.cycle = null
  }

  raiseShield () {
    if (this.shieldUp) return
    this.bot.activateItem(true)
    this.shieldUp = true
    this.shieldUpTick = this.tick
  }

  lowerShield () {
    if (!this.shieldUp) return
    this.bot.deactivateItem()
    this.shieldUp = false
    this.shieldDownTick = this.tick
  }

  isBlocking (entity) {
    const flags = entity.metadata && entity.metadata[LIVING_FLAGS_INDEX]
    if (typeof flags !== 'number' || (flags & 1) === 0) return false
    const items = entity.equipment || []
    return items.some((item) => item && item.name === 'shield')
  }

  bestItem (predicate) {
    const order = ['netherite', 'diamond', 'iron', 'stone', 'golden', 'wooden']
    const rank = (item) => {
      const index = order.findIndex((tier) => item.name.startsWith(tier + '_'))
      return index === -1 ? 99 : index
    }
    return this.bot.inventory.items().filter(predicate).sort((a, b) => rank(a) - rank(b))[0]
  }

  swap (item) {
    this.swapping = true
    this.bot.equip(item, 'hand').catch(() => {}).finally(() => {
      this.swapping = false
      // Switching items resets the 1.9+ charge
      this.lastAttackTick = this.tick
    })
  }
}

module.exports = {
  LEVELS, wrapAngle, anglesTo, aimStep, entityBox, rayHitsBox, cooldownTicks, isWeapon, PositionHistory, CombatEngine
}
