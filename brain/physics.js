'use strict'

// Vanilla 1.21 physics constants (single source of truth for the brain modules).
const PHYS = Object.freeze({
  GRAVITY: 0.08,
  AIR_DRAG: 0.98,
  JUMP_VELOCITY: 0.42,
  GROUND_FRICTION: 0.546,
  AIR_FRICTION: 0.91,
  WALK_ACCEL: 0.098,
  SPRINT_ACCEL: 0.1274,
  AIR_ACCEL: 0.0196,
  AIR_SPRINT_ACCEL: 0.02548,
  SPRINT_JUMP_BOOST: 0.2,
  WALK_SPEED: 0.2159,
  SPRINT_SPEED: 0.2806,
  KB_BASE: 0.4,
  KB_SPRINT: 0.7,
  KB_VERTICAL: 0.4,
  INVULNERABLE_TICKS: 10,
  MAX_REACH: 3.0,
  CRIT_CHARGE: 0.9,
  KB_AIR_TICKS: 10,
  JUMP_RESET_FACTOR: 0.6
})

// Safety cap so a bad constant can never make the arc loop forever.
const MAX_ARC_TICKS = 100
// How many ticks ahead planCritJump tries to start the jump (0..12).
const MAX_JUMP_DELAY = 12

// Vertical arc of a jump from the ground; the last entry is the landing tick (y = 0).
function jumpArc() {
  const arc = []
  let y = 0
  let vy = PHYS.JUMP_VELOCITY
  for (let tick = 1; tick <= MAX_ARC_TICKS; tick++) {
    y += vy
    vy = (vy - PHYS.GRAVITY) * PHYS.AIR_DRAG
    if (y <= 0) {
      arc.push({ tick, y: 0, vy })
      break
    }
    arc.push({ tick, y, vy })
  }
  return arc
}

// Ticks of the jump where the player is falling and still airborne (crits are possible).
function critWindow() {
  const arc = jumpArc()
  let first = null
  let last = null
  let prevY = 0
  for (const step of arc) {
    if (step.y < prevY && step.y > 0) {
      if (first === null) first = step.tick
      last = step.tick
    }
    prevY = step.y
  }
  return { first, last }
}

// Picks when to jump and when to swing so the hit is charged, falling and in reach, or null.
function planCritJump({ untilReady, distance, closingSpeed, minDistance = 2.0, maxReach = 3.0 }) {
  const ready = Math.max(0, untilReady)
  const { first, last } = critWindow()
  let best = null
  for (let jumpIn = 0; jumpIn <= MAX_JUMP_DELAY; jumpIn++) {
    const attackAt = Math.max(ready, jumpIn + first)
    if (attackAt > jumpIn + last) continue
    const predicted = distance - closingSpeed * attackAt
    if (predicted < minDistance || predicted > maxReach) continue
    const offsetScore = Math.abs(attackAt - (jumpIn + first) - 1)
    if (
      best === null ||
      attackAt < best.attackAt ||
      (attackAt === best.attackAt && offsetScore < best.offsetScore)
    ) {
      best = { jumpIn, attackAt, offsetScore }
    }
  }
  return best ? { jumpIn: best.jumpIn, attackAt: best.attackAt } : null
}

// Horizontal knockback speed given to the victim: sprint hits push harder.
function knockbackSpeed({ sprintHit }) {
  return sprintHit ? PHYS.KB_SPRINT : PHYS.KB_BASE
}

// Distance the victim slides in `ticks` ticks. A victim hit on the ground (`fromGround`, the usual
// case) moves its first tick with ground friction, because vanilla applies the friction of where it
// stood before that move; then it flies with air friction until KB_AIR_TICKS and lands (ground).
function knockbackDisplacement({ sprintHit, ticks, kbFactor = 1, jumpReset = false, fromGround = true }) {
  let v = knockbackSpeed({ sprintHit }) * kbFactor * (jumpReset ? PHYS.JUMP_RESET_FACTOR : 1)
  let total = 0
  for (let i = 0; i < ticks; i++) {
    total += v
    const grounded = (i === 0 && fromGround) || i >= PHYS.KB_AIR_TICKS
    v *= grounded ? PHYS.GROUND_FRICTION : PHYS.AIR_FRICTION
  }
  return total
}

// Ticks needed to walk or sprint a straight distance; 0 when there is nothing to cover.
function ticksToCover(distance, { sprint = false } = {}) {
  if (distance <= 0) return 0
  return Math.ceil(distance / (sprint ? PHYS.SPRINT_SPEED : PHYS.WALK_SPEED))
}

// True when a swing right now would be a critical hit under vanilla rules.
function canCrit({ charge, onGround, vy, sprinting, inWater = false, climbing = false }) {
  return charge > PHYS.CRIT_CHARGE && !onGround && vy < 0 && !sprinting && !inWater && !climbing
}

module.exports = {
  PHYS,
  jumpArc,
  critWindow,
  planCritJump,
  knockbackSpeed,
  knockbackDisplacement,
  ticksToCover,
  canCrit
}
