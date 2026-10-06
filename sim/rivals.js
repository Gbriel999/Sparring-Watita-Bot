'use strict'

// Scripted rivals for the duel simulator. A rival is `{ decide(self, bot, tick), onHurt(tick) }`:
//   - `self` / `bot` are the two fighters of the arena; the scripts only read `.entity` (position, yaw,
//     onGround, ...) and, for the jump resetter, `bot.attackQueued` (attacks the bot queued this tick).
//   - `decide` returns `{ controls, attack, look }` for the tick. Rivals aim perfectly (toward the body
//     center of the bot) and an attack counts as a hit whenever the bot is within reach, so a rival is
//     never blind: only the bot under test has to earn its hits.
//   - `onHurt(tick)` is called by the arena when the bot lands a hit on the rival.
// All distances in the scripts are horizontal center-to-center unless stated, except "in reach", which
// is the server's eye-to-box distance. Randomness only comes from the `rng` the arena hands in.

const { PHYS } = require('../brain/physics')
const { reachDistance, EYE_HEIGHT } = require('./world')

// Ticks a rival waits between charged attacks (a full 1.9+ sword charge is reached by tick 12)
const CHARGED_TICKS = 13
const BODY_CENTER = 0.9
const NEVER = -1000

function blankControls () {
  return { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false }
}

function horizontalDistance (self, bot) {
  return Math.hypot(bot.entity.position.x - self.entity.position.x, bot.entity.position.z - self.entity.position.z)
}

function inReach (self, bot) {
  return reachDistance(self.entity.position, bot.entity.position) <= PHYS.MAX_REACH
}

/** Mineflayer yaw/pitch (yaw 0 looks to -Z, positive pitch looks up) from this rival's eye to the bot's body center. */
function aimAtBot (self, bot) {
  const dx = bot.entity.position.x - self.entity.position.x
  const dy = bot.entity.position.y + BODY_CENTER - (self.entity.position.y + EYE_HEIGHT)
  const dz = bot.entity.position.z - self.entity.position.z
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) }
}

// Straight at the bot with the sprint key down; stops at 1.5 and swings every 8 ticks, charged or not
function tanque () {
  let lastAttack = NEVER
  return {
    decide (self, bot, tick) {
      const advance = horizontalDistance(self, bot) > 1.5
      const attack = tick - lastAttack >= 8 && inReach(self, bot)
      if (attack) lastAttack = tick
      return { controls: { ...blankControls(), forward: advance, sprint: advance }, attack, look: aimAtBot(self, bot) }
    },
    onHurt () {}
  }
}

// Closes to 2.9 sprinting, swings charged, w-taps after every hit (sprint released the tick after the
// hit, pressed again the next one) and jumps as the bot's hit lands, 80% of the times
function jumpResetter (rng) {
  let lastAttack = NEVER
  let lastHurt = NEVER
  return {
    decide (self, bot, tick) {
      const distance = horizontalDistance(self, bot)
      const sprint = tick !== lastAttack + 1
      const attack = tick - lastAttack >= CHARGED_TICKS && inReach(self, bot)
      if (attack) lastAttack = tick
      // The jump has to be down in the very tick the hit arrives, so it reacts to the bot's queued attack.
      // While it is invulnerable that attack cannot land: no point in jumping for it.
      const incoming = bot.attackQueued > 0 && tick - lastHurt >= PHYS.INVULNERABLE_TICKS && self.entity.onGround
      const jump = incoming && rng() < 0.8
      return {
        controls: { ...blankControls(), forward: distance > 2.9, sprint, jump },
        attack,
        look: aimAtBot(self, bot)
      }
    },
    onHurt (tick) { lastHurt = tick }
  }
}

// Keeps 2.8..3.2 from the bot and circles it strafing right, changing side every 20..40 ticks
function strafer (rng) {
  let lastAttack = NEVER
  let side = 1
  let nextFlip = null
  return {
    decide (self, bot, tick) {
      if (nextFlip === null) nextFlip = tick + 20 + Math.floor(rng() * 21)
      if (tick >= nextFlip) {
        side = -side
        nextFlip = tick + 20 + Math.floor(rng() * 21)
      }
      const distance = horizontalDistance(self, bot)
      const attack = tick - lastAttack >= CHARGED_TICKS && inReach(self, bot)
      if (attack) lastAttack = tick
      return {
        controls: { ...blankControls(), forward: distance > 3.2, back: distance < 2.8, right: side > 0, left: side < 0 },
        attack,
        look: aimAtBot(self, bot)
      }
    },
    onHurt () {}
  }
}

// Hit and run: swings charged, backs off 6 ticks after each swing, then sprints back in to 2.6
function kiter () {
  let lastAttack = NEVER
  return {
    decide (self, bot, tick) {
      const attack = tick - lastAttack >= CHARGED_TICKS && inReach(self, bot)
      if (attack) lastAttack = tick
      const retreating = tick > lastAttack && tick <= lastAttack + 6
      const advance = !retreating && horizontalDistance(self, bot) > 2.6
      return {
        controls: { ...blankControls(), forward: advance, back: retreating, sprint: advance },
        attack,
        look: aimAtBot(self, bot)
      }
    },
    onHurt () {}
  }
}

const KINDS = {
  tanque: () => tanque(),
  jumpResetter: (rng) => jumpResetter(rng),
  strafer: (rng) => strafer(rng),
  kiter: () => kiter()
}

/** Builds a scripted rival of `kind` ('tanque' | 'jumpResetter' | 'strafer' | 'kiter') fed by `rng`. */
function createRival (kind, rng) {
  if (!Object.prototype.hasOwnProperty.call(KINDS, kind)) {
    throw new Error(`unknown rival kind: ${kind} (expected ${Object.keys(KINDS).join(', ')})`)
  }
  return KINDS[kind](rng)
}

module.exports = { createRival, RIVAL_KINDS: Object.keys(KINDS) }
