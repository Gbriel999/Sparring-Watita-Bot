'use strict'

// Terrain safety: keeps the bot from walking or strafing into the void, lava or other hazards.
// Pure module (no mineflayer dependency): the caller supplies a `blockAt(x, y, z)` function that
// takes integer coordinates and returns `{ name, boundingBox }` ('block' | 'empty') or null
// when the chunk is not loaded.

const HAZARD_BLOCKS = new Set(['lava', 'fire', 'cactus', 'magma_block', 'sweet_berry_bush'])

// How many blocks below the feet we look for solid ground before calling it void
const FLOOR_DEPTH = 3

// Lookahead distances (blocks) along a movement direction
const NEAR_PROBE = 0.8
const FAR_PROBE = 1.6

const DIRECTIONS = ['forward', 'back', 'left', 'right']
const OPPOSITE = { forward: 'back', back: 'forward', left: 'right', right: 'left' }

// Unit movement vectors in the XZ plane, following the mineflayer convention:
// yaw 0 looks toward -Z, and yaw increases counter-clockwise seen from above
// (so yaw = -PI/2 looks toward +X). "right" is the clockwise side of "forward".
function moveVectors (yaw) {
  const sin = Math.sin(yaw)
  const cos = Math.cos(yaw)
  return {
    forward: { x: -sin, z: -cos },
    back: { x: sin, z: cos },
    left: { x: -cos, z: sin },
    right: { x: cos, z: -sin }
  }
}

// `y` is the height of the feet. Dangerous when a hazard block sits at the feet or just
// below, when there is no solid block within FLOOR_DEPTH blocks under the feet, or when
// the chunk is not loaded (blockAt returns null).
function isDangerous (blockAt, x, y, z) {
  const bx = Math.floor(x)
  const by = Math.floor(y)
  const bz = Math.floor(z)

  const feet = blockAt(bx, by, bz)
  if (!feet) return true
  if (HAZARD_BLOCKS.has(feet.name)) return true

  const below = blockAt(bx, by - 1, bz)
  if (!below) return true
  if (HAZARD_BLOCKS.has(below.name)) return true

  let solid = below.boundingBox === 'block'
  for (let d = 2; d <= FLOOR_DEPTH && !solid; d++) {
    const block = blockAt(bx, by - d, bz)
    if (!block) return true
    solid = block.boundingBox === 'block'
  }
  return !solid
}

// Filters movement controls so the bot never steps into danger. Returns a new controls
// object (the input is not mutated). Two passes, so the second never undoes the first:
//   1. Cancel every pressed direction whose 0.8 or 1.6 probe is dangerous (forward also
//      drops sprint) and remember which ones were cancelled.
//   2. For EVERY direction (pressed or not) whose 0.8 probe is dangerous (e.g. a knockback
//      left the bot at the edge), push its opposite to true, but only if the opposite's 0.8
//      probe is safe and the opposite was not cancelled in pass 1.
// `edge: true` is added only when this call changed at least one control value; it is
// absent when nothing changed (e.g. the opposite was already pressed).
function safeControls (controls, { position, yaw, blockAt }) {
  const out = { ...controls }
  const vectors = moveVectors(yaw)

  const probe = (dir, dist) => isDangerous(
    blockAt,
    position.x + vectors[dir].x * dist,
    position.y,
    position.z + vectors[dir].z * dist
  )

  let edge = false

  // Pass 1: cancel pressed directions that lead into danger
  const cancelled = new Set()
  for (const dir of DIRECTIONS) {
    if (controls[dir] === true && (probe(dir, NEAR_PROBE) || probe(dir, FAR_PROBE))) {
      out[dir] = false
      if (dir === 'forward') out.sprint = false
      cancelled.add(dir)
      edge = true
    }
  }

  // Pass 2: push inward, away from every direction that is dangerous right at the bot's feet
  for (const dir of DIRECTIONS) {
    if (!probe(dir, NEAR_PROBE)) continue
    const opposite = OPPOSITE[dir]
    if (cancelled.has(opposite) || probe(opposite, NEAR_PROBE)) continue
    if (out[opposite] !== true) {
      out[opposite] = true
      edge = true
    }
  }

  if (edge) out.edge = true
  return out
}

module.exports = { moveVectors, isDangerous, safeControls }
