'use strict'

// The owner's habits, learned from the inputs of his own client (the Watita Sparring Link mod, see
// input-link.js): exact key presses, attack clicks with the charge they had, and when he was hurt, instead of
// what the server's late positions suggest. Pure module: the engine feeds frames, OpponentModel merges the
// summary into its own. It only accumulates habits; nothing here is meant to react to the current frame.

const { isNum, pushBounded, median, rate, confidence, halve, readArray, readInt, halvePart } = require('./stats')

// Key bits of the protocol (`k`)
const KEYS = Object.freeze({ FORWARD: 1, BACK: 2, LEFT: 4, RIGHT: 8, JUMP: 16, SNEAK: 32, SPRINT: 64, ATTACK: 128, USE: 256 })

// A click counts as a fight click when the bot is closer than this (eye to box, blocks)
const NEAR_BOT = 4
// A click under this charge is a spammed one (the same line as a crit's 0.9)
const CHARGED = 0.9
// Click gaps above this many ticks are pauses, not rhythm
const MAX_GAP = 40
// Ticks after a click in which a w-tap (forward let go) or an s-tap (back pressed) belongs to it
const TAP_WINDOW = 4
// A forward key held off longer than this is no w-tap length anymore
const WTAP_MAX = 10
// Ticks after a hit taken in which a jump is a jump reset (the same tick counts: 0)
const JUMP_RESET_WINDOW = 2

// Minimum samples before a habit stops being null
const MIN = Object.freeze({ clicks: 10, gaps: 6, aimed: 8, wtap: 5, stap: 5, hurts: 5, strafe: 5 })

class InputHabits {
  constructor () {
    this.frames = 0
    // Fight clicks (bot near) and their charge
    this.clicks = 0
    this.spamClicks = 0
    this.charges = []
    this.gaps = []
    // Clicks with the bot in the crosshair: crit attempts and distance
    this.aimClicks = 0
    this.critClicks = 0
    this.distances = []
    // After a sprint click: forward let go (w-tap) and for how long
    this.wtapWindows = 0
    this.wtaps = 0
    this.wtapLengths = []
    // After an aimed click: back pressed (s-tap)
    this.stapWindows = 0
    this.staps = 0
    // Hits taken on the ground, the jump resets among them and their delay
    this.hurts = 0
    this.jumpResets = 0
    this.jumpResetDelays = []
    // Ticks in a row on only A or only D
    this.strafeRuns = []

    // Per-fight state, never persisted
    this._lastSeq = null
    this._lastGround = true
    this._lastClickSeq = null
    this._wtap = null
    this._stap = null
    this._jump = null
    this._runSide = null
    this._runLength = 0
  }

  observeFrame (frame) {
    if (!frame || !isNum(frame.seq)) return
    const seq = frame.seq
    if (this._lastSeq !== null && seq !== this._lastSeq + 1) this._breakStreaks()
    this._lastSeq = seq
    this.frames++
    const keys = isNum(frame.k) ? frame.k : 0

    this._trackWindows(seq, keys)
    this._trackStrafe(keys)
    // The ground state before this tick's move: a hit taken there can be jump reset
    if (frame.hurt === true && this._lastGround) {
      this._jump = { seq }
    }
    if (this._jump && (keys & KEYS.JUMP)) this._closeJump(seq - this._jump.seq)
    this._lastGround = frame.gnd !== false

    for (const click of Array.isArray(frame.atk) ? frame.atk : []) this._observeClick(seq, keys, click)
  }

  _observeClick (seq, keys, click) {
    if (!click || !isNum(click.c)) return
    if (isNum(click.dist) && click.dist < NEAR_BOT) {
      this.clicks++
      if (click.c < CHARGED) this.spamClicks++
      pushBounded(this.charges, click.c)
      if (this._lastClickSeq !== null) {
        const gap = seq - this._lastClickSeq
        if (gap >= 0 && gap <= MAX_GAP) pushBounded(this.gaps, gap)
      }
      this._lastClickSeq = seq
    }
    if (click.aim !== true) return
    this.aimClicks++
    if (click.gnd === false && isNum(click.vy) && click.vy < 0 && click.spr !== true) this.critClicks++
    if (isNum(click.dist)) pushBounded(this.distances, click.dist)
    // A new click settles the windows of the previous one as they stand
    if (this._wtap && this._wtap.released !== null) this._closeWtap(seq - this._wtap.released)
    this._wtap = click.spr === true ? { seq, released: null } : null
    if (this._stap) this._closeStap(false)
    this._stap = { seq }
  }

  _trackWindows (seq, keys) {
    const wtap = this._wtap
    if (wtap) {
      if (wtap.released === null) {
        if (!(keys & KEYS.FORWARD)) wtap.released = seq
        else if (seq - wtap.seq > TAP_WINDOW) this._closeWtap(null)
      } else if (keys & KEYS.FORWARD) {
        this._closeWtap(seq - wtap.released)
      } else if (seq - wtap.released >= WTAP_MAX) {
        this._closeWtap(WTAP_MAX)
      }
    }
    const stap = this._stap
    if (stap) {
      if (keys & KEYS.BACK) this._closeStap(true)
      else if (seq - stap.seq >= TAP_WINDOW) this._closeStap(false)
    }
    if (this._jump && seq - this._jump.seq > JUMP_RESET_WINDOW) this._closeJump(null)
  }

  /** length null: no w-tap after that sprint click. */
  _closeWtap (length) {
    this._wtap = null
    this.wtapWindows++
    if (length === null) return
    this.wtaps++
    pushBounded(this.wtapLengths, length)
  }

  _closeStap (done) {
    this._stap = null
    this.stapWindows++
    if (done) this.staps++
  }

  /** delay null: no jump in the window. */
  _closeJump (delay) {
    this._jump = null
    this.hurts++
    if (delay === null) return
    this.jumpResets++
    pushBounded(this.jumpResetDelays, delay)
  }

  _trackStrafe (keys) {
    const left = (keys & KEYS.LEFT) !== 0
    const right = (keys & KEYS.RIGHT) !== 0
    const side = left && !right ? 'left' : right && !left ? 'right' : null
    if (side !== null && side === this._runSide) {
      this._runLength++
      return
    }
    this._endRun()
    this._runSide = side
    this._runLength = side ? 1 : 0
  }

  _endRun () {
    if (this._runSide && this._runLength > 0) pushBounded(this.strafeRuns, this._runLength)
    this._runSide = null
    this._runLength = 0
  }

  // Lost frames: a strafe run ends where the data ends, and undecided windows are dropped
  _breakStreaks () {
    this._endRun()
    this._wtap = null
    this._stap = null
    this._jump = null
    this._lastClickSeq = null
  }

  summary () {
    const counts = {
      spamRate: this.clicks,
      swingInterval: this.gaps.length,
      hitCharge: this.clicks,
      critAttemptRate: this.aimClicks,
      hitDistance: this.aimClicks,
      wtapRate: this.wtapWindows,
      wtapTicks: this.wtaps,
      stapRate: this.stapWindows,
      jumpResetRate: this.hurts,
      jumpResetTicks: this.jumpResets,
      strafeLength: this.strafeRuns.length
    }
    const minimum = {
      spamRate: MIN.clicks,
      swingInterval: MIN.gaps,
      hitCharge: MIN.clicks,
      critAttemptRate: MIN.aimed,
      hitDistance: MIN.aimed,
      wtapRate: MIN.wtap,
      wtapTicks: MIN.wtap,
      stapRate: MIN.stap,
      jumpResetRate: MIN.hurts,
      jumpResetTicks: MIN.hurts,
      strafeLength: MIN.strafe
    }
    const enough = (key) => counts[key] >= minimum[key] && counts[key] > 0
    const values = {
      spamRate: enough('spamRate') ? rate(this.spamClicks, this.clicks) : null,
      swingInterval: enough('swingInterval') ? median(this.gaps) : null,
      hitCharge: enough('hitCharge') && this.charges.length > 0 ? median(this.charges) : null,
      critAttemptRate: enough('critAttemptRate') ? rate(this.critClicks, this.aimClicks) : null,
      hitDistance: enough('hitDistance') && this.distances.length > 0 ? median(this.distances) : null,
      wtapRate: enough('wtapRate') ? rate(this.wtaps, this.wtapWindows) : null,
      wtapTicks: this.wtapWindows >= MIN.wtap && this.wtapLengths.length > 0 ? median(this.wtapLengths) : null,
      stapRate: enough('stapRate') ? rate(this.staps, this.stapWindows) : null,
      jumpResetRate: enough('jumpResetRate') ? rate(this.jumpResets, this.hurts) : null,
      jumpResetTicks: this.hurts >= MIN.hurts && this.jumpResetDelays.length > 0 ? median(this.jumpResetDelays) : null,
      strafeLength: enough('strafeLength') ? median(this.strafeRuns) : null
    }
    const conf = {}
    for (const key of Object.keys(counts)) conf[key] = confidence(counts[key], minimum[key])
    return { samples: this.frames, ...values, confidence: conf }
  }

  // Plain JSON; per-fight state is not saved.
  toJSON () {
    return {
      version: 1,
      frames: this.frames,
      clicks: this.clicks,
      spamClicks: this.spamClicks,
      charges: this.charges.slice(),
      gaps: this.gaps.slice(),
      aimClicks: this.aimClicks,
      critClicks: this.critClicks,
      distances: this.distances.slice(),
      wtapWindows: this.wtapWindows,
      wtaps: this.wtaps,
      wtapLengths: this.wtapLengths.slice(),
      stapWindows: this.stapWindows,
      staps: this.staps,
      hurts: this.hurts,
      jumpResets: this.jumpResets,
      jumpResetDelays: this.jumpResetDelays.slice(),
      strafeRuns: this.strafeRuns.slice()
    }
  }

  // Comes back as a prior (half of every counter, the latest half of every array, never below a reached
  // minimum), like OpponentModel.fromJSON; asPrior false reads it whole.
  static fromJSON (json, { asPrior = true } = {}) {
    const h = new InputHabits()
    const j = json && typeof json === 'object' ? json : {}
    h.frames = halve(readInt(j.frames), 0, asPrior)

    const clicks = readInt(j.clicks)
    h.clicks = halve(clicks, MIN.clicks, asPrior)
    h.spamClicks = halvePart(readInt(j.spamClicks), clicks, h.clicks)
    h.charges = readArray(j.charges, MIN.clicks, asPrior)
    h.gaps = readArray(j.gaps, MIN.gaps, asPrior)

    const aimed = readInt(j.aimClicks)
    h.aimClicks = halve(aimed, MIN.aimed, asPrior)
    h.critClicks = halvePart(readInt(j.critClicks), aimed, h.aimClicks)
    h.distances = readArray(j.distances, MIN.aimed, asPrior)

    const wtapWindows = readInt(j.wtapWindows)
    h.wtapWindows = halve(wtapWindows, MIN.wtap, asPrior)
    h.wtaps = halvePart(readInt(j.wtaps), wtapWindows, h.wtapWindows)
    h.wtapLengths = readArray(j.wtapLengths, 0, asPrior)

    const stapWindows = readInt(j.stapWindows)
    h.stapWindows = halve(stapWindows, MIN.stap, asPrior)
    h.staps = halvePart(readInt(j.staps), stapWindows, h.stapWindows)

    const hurts = readInt(j.hurts)
    h.hurts = halve(hurts, MIN.hurts, asPrior)
    h.jumpResets = halvePart(readInt(j.jumpResets), hurts, h.hurts)
    h.jumpResetDelays = readArray(j.jumpResetDelays, 0, asPrior)

    h.strafeRuns = readArray(j.strafeRuns, MIN.strafe, asPrior)
    return h
  }
}

module.exports = { InputHabits, KEYS }
