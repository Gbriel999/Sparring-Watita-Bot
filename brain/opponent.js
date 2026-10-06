'use strict'

// Opponent model: learns the habits of the human rival during a fight (reach, swing rhythm,
// jump resets, knockback taken, strafe orbit, aim weak side, crits, shield, aggression).
// Pure module: the combat engine feeds observations, tactics read summary().
// Sample counts are plain integer counters; the arrays only keep the latest values for the
// medians, so confidence and the minimums keep working after a halved reload (fromJSON).

const { knockbackDisplacement } = require('./physics')

// Latest values kept per array
const MAX_SAMPLES = 60
// Swing gaps above this many ticks are pauses, not rhythm
const MAX_SWING_GAP = 40
// Swing gaps below this many ticks count as click spam
const SPAM_GAP = 10
// Knockback measurement. A vanilla server sends other players' positions every 2 ticks, and the
// rival's knockback only shows up after its own round trip, so the flight is timed from the first
// position update that shows it, never from the damage event.
// A rival hit on the ground shows its knockback as a rise (the hop, or the jump of a jump reset)
const KB_RISE_MIN = 0.1
// No sign of the knockback within this many ticks of the hit: the measurement is dropped
const KB_START_TIMEOUT = 10
// The highest point of the flight above where it started tells a jump reset from the plain hop:
// the hop (vy 0.4, KB_VERTICAL) peaks near 1.15 blocks, a jump (vy 0.42, JUMP_VELOCITY) near 1.25
const JUMP_RESET_PEAK = 1.2
// Ticks after that first update when the displacement is measured
const KB_MEASURE_TICKS = 6
// Upper bound of the measured knockback factor
const KB_FACTOR_MAX = 2
// Lateral speed (cross / distance) above which a tick counts as an orbit tick
const ORBIT_LATERAL_MIN = 0.05
// Distance change per tick above which the rival counts as closing in or backing off
const CLOSING_MIN = 0.05
// Distance under which shield use is measured
const BLOCK_RANGE = 4
// Distance up to which the preferred spacing is measured
const PREFERRED_RANGE = 8
// Aim error difference (rad) needed to call one side weaker
const WEAK_SIDE_GAP = 0.03

// Minimum samples before a trait stops being null
const MIN_REACH = 3
const MIN_RHYTHM = 4
const MIN_KB = 3
const MIN_ORBIT = 40
const MIN_WEAK_SIDE = 30
const MIN_CRIT = 3
const MIN_BLOCK = 40
const MIN_AGGRESSION = 40
const MIN_PREFERRED = 40
// confidence = min(1, samples / (CONFIDENCE_FACTOR * minimum))
const CONFIDENCE_FACTOR = 5

const ZERO_VEL = Object.freeze({ x: 0, y: 0, z: 0 })

function isNum (v) {
  return typeof v === 'number' && Number.isFinite(v)
}

function pushBounded (arr, value) {
  arr.push(value)
  if (arr.length > MAX_SAMPLES) arr.splice(0, arr.length - MAX_SAMPLES)
}

function clamp (v, min, max) {
  return Math.min(max, Math.max(min, v))
}

// Median: sorted[floor(n / 2)] (upper middle for even n); null when empty.
function median (values) {
  if (values.length === 0) return null
  const sorted = values.slice().sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

// 90th percentile: sorted[min(n - 1, floor(0.9 * n))]; null when empty.
function p90 (values) {
  if (values.length === 0) return null
  const sorted = values.slice().sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(0.9 * sorted.length))]
}

// Ratio of two counters, capped at 1 in case a hand-edited file holds inconsistent counters.
function rate (part, total) {
  return Math.min(1, part / total)
}

function confidence (samples, minimum) {
  return Math.min(1, samples / (CONFIDENCE_FACTOR * minimum))
}

// --- JSON sanitizers (the memory file may be edited by hand or corrupted) ---

// Half of n with Math.floor. A trait that had reached its minimum sample count keeps at least that
// minimum, so a prior that was valid stays valid after the reload (minKeep 0 = plain halving).
// prior false keeps n whole (a read-only look at the remembered model).
function halve (n, minKeep = 0, prior = true) {
  if (!prior) return n
  const half = Math.floor(n / 2)
  return n >= minKeep ? Math.max(half, minKeep) : half
}

// Latest numbers of a saved array (only its most recent half, see halve).
function readArray (value, minKeep = 0, prior = true) {
  if (!Array.isArray(value)) return []
  const nums = value.filter(isNum).slice(-MAX_SAMPLES)
  return nums.slice(nums.length - halve(nums.length, minKeep, prior))
}

// Non-negative integer from the file, or 0.
function readInt (value) {
  return isNum(value) && value > 0 ? Math.floor(value) : 0
}

// Part of a halved total (crits of hitsTaken...): halved the same way, so the rate survives.
function halvePart (part, total, newTotal) {
  if (total <= 0) return 0
  const scaled = newTotal === Math.floor(total / 2) ? Math.floor(part / 2) : Math.floor(part * newTotal / total)
  return Math.min(newTotal, scaled)
}

// Per-side aim error accumulator { sum, count }; the sum shrinks with the count so the mean survives.
function readAim (value, prior = true) {
  const src = value && typeof value === 'object' ? value : {}
  const count = readInt(src.count)
  const sum = isNum(src.sum) && src.sum > 0 ? src.sum : 0
  const newCount = halve(count, 0, prior)
  return { sum: count > 0 ? sum * (newCount / count) : 0, count: newCount }
}

class OpponentModel {
  constructor () {
    this.ticks = 0

    this.reach = []
    this.hitsTaken = 0
    this.crits = 0

    this.swingGaps = []
    this.swingCount = 0
    this.spamCount = 0

    this.kbFactors = []
    this.kbCount = 0
    this.jumpResets = 0

    this.orbitPos = 0
    this.orbitNeg = 0
    this.strafeRuns = []

    this.aimLeft = { sum: 0, count: 0 }
    this.aimRight = { sum: 0, count: 0 }

    this.nearTicks = 0
    this.blockTicks = 0

    this.closeTicks = 0
    this.moveTicks = 0

    this.distances = []
    this.closeRangeTicks = 0

    // Per-fight state, never persisted
    this._lastSwingTick = null
    this._prevDistance = null
    this._pendingHit = null
    this._runSign = 0
    this._runLength = 0
  }

  observeTick ({ tick, distance, targetPos, targetVel, targetOnGround, targetBlocking, botPos, botStrafe, targetAimError }) {
    this.ticks++
    const vel = targetVel || ZERO_VEL

    this._trackKnockback(tick, targetPos)

    if (isNum(distance)) {
      // closing > 0: the rival is getting closer
      if (this._prevDistance !== null) {
        const closing = this._prevDistance - distance
        if (Math.abs(closing) > CLOSING_MIN) {
          this.moveTicks++
          if (closing > CLOSING_MIN) this.closeTicks++
        }
      }
      this._prevDistance = distance

      if (distance < BLOCK_RANGE) {
        this.nearTicks++
        if (targetBlocking) this.blockTicks++
      }

      if (distance <= PREFERRED_RANGE) {
        pushBounded(this.distances, distance)
        this.closeRangeTicks++
      }

      if (distance > 0 && targetPos && botPos) this._trackOrbit(distance, targetPos, botPos, vel)
    } else {
      this._prevDistance = null
    }

    // Aim error is accumulated on the side the bot is strafing to
    if (isNum(targetAimError) && (botStrafe === 'left' || botStrafe === 'right')) {
      const side = botStrafe === 'left' ? this.aimLeft : this.aimRight
      side.sum += Math.abs(targetAimError)
      side.count++
    }
  }

  // Orbit sign: sign of (r x v)_y = r.z * v.x - r.x * v.z, positive = counter-clockwise around the bot.
  _trackOrbit (distance, targetPos, botPos, vel) {
    const rx = targetPos.x - botPos.x
    const rz = targetPos.z - botPos.z
    const cross = rz * vel.x - rx * vel.z
    if (Math.abs(cross) / distance <= ORBIT_LATERAL_MIN) return
    const sign = cross > 0 ? 1 : -1
    if (sign > 0) this.orbitPos++
    else this.orbitNeg++

    if (sign === this._runSign) {
      this._runLength++
    } else {
      if (this._runSign !== 0) pushBounded(this.strafeRuns, this._runLength)
      this._runSign = sign
      this._runLength = 1
    }
  }

  // Times the knockback flight of the last landed hit and measures it. The flight starts at the first
  // position update that shows it: a rise for a rival hit on the ground (walking does not count), any
  // move for one hit in the air. That update already holds about one tick of the flight, so the
  // displacement KB_MEASURE_TICKS later is compared with KB_MEASURE_TICKS + 1 ticks of nominal flight.
  // A jump reset is told by the peak of the flight, which survives the 2-tick update cadence.
  _trackKnockback (tick, targetPos) {
    const hit = this._pendingHit
    if (!hit || !targetPos) return
    const pos = { x: targetPos.x, y: targetPos.y, z: targetPos.z }
    if (hit.startTick === null) {
      const last = hit.last
      const started = hit.onGround
        ? pos.y - last.y > KB_RISE_MIN
        : pos.x !== last.x || pos.y !== last.y || pos.z !== last.z
      if (!started) {
        if (tick - hit.tick >= KB_START_TIMEOUT) this._pendingHit = null
        else hit.last = pos
        return
      }
      hit.startTick = tick
      hit.origin = last
    }
    hit.peak = Math.max(hit.peak, pos.y - hit.origin.y)
    if (tick < hit.startTick + KB_MEASURE_TICKS) return

    this._pendingHit = null
    const jumpReset = hit.onGround && hit.peak > JUMP_RESET_PEAK
    const displacement = Math.hypot(pos.x - hit.origin.x, pos.z - hit.origin.z)
    const nominal = knockbackDisplacement({
      sprintHit: hit.sprintHit,
      ticks: tick - hit.startTick + 1,
      jumpReset,
      // A rival hit in the air keeps flying from the first tick; on the ground the first tick drags
      fromGround: hit.onGround
    })
    if (!(nominal > 0)) return
    pushBounded(this.kbFactors, clamp(displacement / nominal, 0, KB_FACTOR_MAX))
    this.kbCount++
    if (jumpReset) this.jumpResets++
  }

  observeSwing (tick) {
    if (this._lastSwingTick !== null) {
      const gap = tick - this._lastSwingTick
      // Long gaps are pauses, not rhythm
      if (gap >= 0 && gap <= MAX_SWING_GAP) {
        pushBounded(this.swingGaps, gap)
        this.swingCount++
        if (gap < SPAM_GAP) this.spamCount++
      }
    }
    this._lastSwingTick = tick
  }

  // The rival landed a hit on the bot: where reach and crits are learned.
  observeHitTaken ({ tick, distance, targetFalling }) {
    this.hitsTaken++
    if (isNum(distance)) pushBounded(this.reach, distance)
    if (targetFalling) this.crits++
  }

  // The bot landed a hit on the rival (the damage event): the knockback measurement waits for the
  // first position update that shows the flight (see _trackKnockback).
  observeHitLanded ({ tick, sprintHit, targetPos, targetOnGround }) {
    if (!targetPos) return
    this._pendingHit = {
      tick,
      // The latest position seen before the flight shows up, then where the flight started
      last: { x: targetPos.x, y: targetPos.y, z: targetPos.z },
      origin: null,
      startTick: null,
      peak: 0,
      sprintHit: !!sprintHit,
      onGround: !!targetOnGround
    }
  }

  // Ticks until the rival sword is charged again; null while the rhythm is unknown.
  enemyReadyIn (tick) {
    const interval = this._swingInterval()
    if (interval === null || this._lastSwingTick === null) return null
    return Math.max(0, interval - (tick - this._lastSwingTick))
  }

  _swingInterval () {
    return this.swingCount >= MIN_RHYTHM ? median(this.swingGaps) : null
  }

  summary () {
    const orbitCount = this.orbitPos + this.orbitNeg
    const strafeRuns = this.strafeRuns

    let weakSide = null
    if (this.aimLeft.count >= MIN_WEAK_SIDE && this.aimRight.count >= MIN_WEAK_SIDE) {
      const left = this.aimLeft.sum / this.aimLeft.count
      const right = this.aimRight.sum / this.aimRight.count
      if (Math.abs(left - right) > WEAK_SIDE_GAP) weakSide = left > right ? 'left' : 'right'
    }

    const hasKb = this.kbCount >= MIN_KB
    return {
      samples: this.ticks,
      reach: this.hitsTaken >= MIN_REACH && this.reach.length > 0
        ? { median: median(this.reach), p90: p90(this.reach) }
        : null,
      swingInterval: this._swingInterval(),
      spamRate: this.swingCount >= MIN_RHYTHM ? rate(this.spamCount, this.swingCount) : null,
      jumpResetRate: hasKb ? rate(this.jumpResets, this.kbCount) : null,
      kbFactor: hasKb ? median(this.kbFactors) : null,
      orbit: orbitCount >= MIN_ORBIT ? (this.orbitPos - this.orbitNeg) / orbitCount : null,
      strafeLength: strafeRuns.length > 0 ? strafeRuns.reduce((a, b) => a + b, 0) / strafeRuns.length : null,
      weakSide,
      critRate: this.hitsTaken >= MIN_CRIT ? rate(this.crits, this.hitsTaken) : null,
      blockRate: this.nearTicks >= MIN_BLOCK ? rate(this.blockTicks, this.nearTicks) : null,
      aggression: this.moveTicks >= MIN_AGGRESSION ? rate(this.closeTicks, this.moveTicks) : null,
      preferredDistance: this.closeRangeTicks >= MIN_PREFERRED ? median(this.distances) : null,
      confidence: {
        reach: confidence(this.hitsTaken, MIN_REACH),
        rhythm: confidence(this.swingCount, MIN_RHYTHM),
        jumpReset: confidence(this.kbCount, MIN_KB),
        kb: confidence(this.kbCount, MIN_KB),
        strafe: confidence(orbitCount, MIN_ORBIT),
        weakSide: confidence(Math.min(this.aimLeft.count, this.aimRight.count), MIN_WEAK_SIDE),
        crit: confidence(this.hitsTaken, MIN_CRIT),
        block: confidence(this.nearTicks, MIN_BLOCK)
      }
    }
  }

  // Plain JSON (numbers, arrays, objects); per-fight state is not saved.
  toJSON () {
    return {
      version: 1,
      ticks: this.ticks,
      reach: this.reach.slice(),
      hitsTaken: this.hitsTaken,
      crits: this.crits,
      swingGaps: this.swingGaps.slice(),
      swingCount: this.swingCount,
      spamCount: this.spamCount,
      kbFactors: this.kbFactors.slice(),
      kbCount: this.kbCount,
      jumpResets: this.jumpResets,
      orbitPos: this.orbitPos,
      orbitNeg: this.orbitNeg,
      strafeRuns: this.strafeRuns.slice(),
      aimLeft: { sum: this.aimLeft.sum, count: this.aimLeft.count },
      aimRight: { sum: this.aimRight.sum, count: this.aimRight.count },
      nearTicks: this.nearTicks,
      blockTicks: this.blockTicks,
      closeTicks: this.closeTicks,
      moveTicks: this.moveTicks,
      distances: this.distances.slice(),
      closeRangeTicks: this.closeRangeTicks
    }
  }

  // The saved model comes back as a prior: only the most recent half of every array and half of
  // every counter survive, so what is observed in the new fight weighs more. The traits with a tiny
  // minimum (reach, crit, rhythm, knockback) never drop below it, otherwise a rival remembered
  // from a short fight would come back as unknown. asPrior false reads it whole, for display only.
  static fromJSON (json, { asPrior = true } = {}) {
    const m = new OpponentModel()
    const j = json && typeof json === 'object' ? json : {}

    m.ticks = halve(readInt(j.ticks), 0, asPrior)

    const hits = readInt(j.hitsTaken)
    m.hitsTaken = halve(hits, MIN_REACH, asPrior)
    m.crits = halvePart(readInt(j.crits), hits, m.hitsTaken)
    m.reach = readArray(j.reach, MIN_REACH, asPrior)

    const swings = readInt(j.swingCount)
    m.swingCount = halve(swings, MIN_RHYTHM, asPrior)
    m.spamCount = halvePart(readInt(j.spamCount), swings, m.swingCount)
    m.swingGaps = readArray(j.swingGaps, MIN_RHYTHM, asPrior)

    const kbs = readInt(j.kbCount)
    m.kbCount = halve(kbs, MIN_KB, asPrior)
    m.jumpResets = halvePart(readInt(j.jumpResets), kbs, m.kbCount)
    m.kbFactors = readArray(j.kbFactors, MIN_KB, asPrior)

    m.orbitPos = halve(readInt(j.orbitPos), 0, asPrior)
    m.orbitNeg = halve(readInt(j.orbitNeg), 0, asPrior)
    m.strafeRuns = readArray(j.strafeRuns, 0, asPrior)
    m.aimLeft = readAim(j.aimLeft, asPrior)
    m.aimRight = readAim(j.aimRight, asPrior)
    m.nearTicks = halve(readInt(j.nearTicks), 0, asPrior)
    m.blockTicks = halve(readInt(j.blockTicks), 0, asPrior)
    m.closeTicks = halve(readInt(j.closeTicks), 0, asPrior)
    m.moveTicks = halve(readInt(j.moveTicks), 0, asPrior)
    m.distances = readArray(j.distances, 0, asPrior)
    m.closeRangeTicks = halve(readInt(j.closeRangeTicks), 0, asPrior)
    return m
  }
}

module.exports = { OpponentModel }
