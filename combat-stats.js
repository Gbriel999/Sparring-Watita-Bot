'use strict'
// The bot's combat record for the panel, counted from what the server confirms: an attack is a
// landed hit only when the target takes damage right after it (the server can refuse a hit), a
// miss when it does not or when the bot swung at the air; hits received are the bot's own damage.

class CombatStats {
  constructor (options = {}) {
    this.confirmMs = options.confirmMs || 350
    this.reset(0)
  }

  reset (now) {
    this.since = now
    this.pending = [] // attacks waiting for the target's damage: { kind, at }
    this.landed = 0
    this.missed = 0
    this.received = 0
    this.damageTaken = 0
    this.crits = 0
    this.sprintHits = 0
    this.combo = 0
    this.comboMax = 0
    this.totems = 0
    this.deaths = 0
  }

  /** An attack aimed at the target: 'crit', 'sprint' or 'hit'. */
  attack (kind, now) {
    this.expire(now)
    this.pending.push({ kind, at: now })
  }

  swingAir (now) {
    this.expire(now)
    this.missed++
  }

  /** The target took damage: it confirms the oldest attack still in its window. */
  targetHurt (now) {
    this.expire(now)
    const confirmed = this.pending.shift()
    if (!confirmed) return
    this.landed++
    if (confirmed.kind === 'crit') this.crits++
    if (confirmed.kind === 'sprint') this.sprintHits++
    this.combo++
    this.comboMax = Math.max(this.comboMax, this.combo)
  }

  /** The bot took damage (health lost, in half hearts). */
  selfHurt (damage, now) {
    this.expire(now)
    this.received++
    this.damageTaken += Math.max(0, damage)
    this.combo = 0
  }

  /** Health went down (the damage packet and the health update arrive separately). */
  healthLost (amount) {
    if (amount > 0) this.damageTaken += amount
  }

  totemPop () {
    this.totems++
  }

  death () {
    this.deaths++
    this.combo = 0
  }

  /** Attacks the server never turned into damage are misses. */
  expire (now) {
    while (this.pending.length > 0 && now - this.pending[0].at > this.confirmMs) {
      this.pending.shift()
      this.missed++
      this.combo = 0
    }
  }

  snapshot (now) {
    this.expire(now)
    const swings = this.landed + this.missed
    return {
      since: this.since,
      landed: this.landed,
      missed: this.missed,
      received: this.received,
      damageTaken: Math.round(this.damageTaken * 10) / 10,
      accuracy: swings > 0 ? this.landed / swings : null,
      crits: this.crits,
      sprintHits: this.sprintHits,
      combo: this.combo,
      comboMax: this.comboMax,
      totems: this.totems,
      deaths: this.deaths
    }
  }
}

module.exports = { CombatStats }
