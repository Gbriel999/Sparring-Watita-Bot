'use strict'
// Tick-by-tick records for the panel, like a fighting game's training mode: the input log (each
// distinct key state with how many frames it was held) and the frame meter (attack charge, swings
// and damage taken on each of the last ticks). One tick = one 50 ms physics tick.

const CONTROLS = ['forward', 'back', 'left', 'right', 'jump', 'sprint', 'sneak', 'shield']

class InputLog {
  constructor (maxEntries) {
    this.maxEntries = maxEntries
    this.list = [] // oldest first
    this.nextId = 1
  }

  /** One tick: the held controls ({ forward: true, ... }) and the swing of this tick, if any. */
  push (controls, attack) {
    const keys = CONTROLS.filter((control) => controls[control])
    const last = this.list[this.list.length - 1]
    if (last && !attack && !last.attack && last.keys.join() === keys.join()) {
      last.frames++
      return
    }
    this.list.push({ id: this.nextId++, keys, attack: attack || null, frames: 1 })
    if (this.list.length > this.maxEntries) this.list.shift()
  }

  /** Newest first, as the input display reads top-down. */
  entries () {
    return this.list.slice().reverse()
  }
}

class FrameMeter {
  constructor (maxFrames) {
    this.maxFrames = maxFrames
    this.list = []
  }

  /** charge 0..1, attack kind or null, hurt = knockback received on this tick. */
  push (charge, attack, hurt) {
    this.list.push({ c: Math.round(charge * 100) / 100, a: attack || null, k: Boolean(hurt) })
    if (this.list.length > this.maxFrames) this.list.shift()
  }

  /** Oldest first, left to right. */
  frames () {
    return this.list.slice()
  }
}

module.exports = { CONTROLS, InputLog, FrameMeter }
