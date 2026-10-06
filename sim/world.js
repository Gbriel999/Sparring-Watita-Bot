'use strict'

// The duel arena world and the small geometry the duel rules need.
//
// Ground: a layer of stone at y = -1, so the surface players stand on is y = 0. `platform` is given in
// BLOCK coordinates and is inclusive on both ends ({ minX: -3, maxX: 3 } covers the blocks -3..3, i.e.
// the world x range [-3, 4)). Outside the platform there is only air (the void); `platform: null` is an
// infinite floor. `blockAt` and `floorAt` always agree with each other.

const { Vec3 } = require('vec3')
const { entityBox } = require('../combat')

const EYE_HEIGHT = 1.62
const FLOOR_Y = -1

function createWorld ({ platform = null } = {}) {
  const solidColumn = (bx, bz) => platform === null ||
    (bx >= platform.minX && bx <= platform.maxX && bz >= platform.minZ && bz <= platform.maxZ)

  /** Block at integer coordinates, or at a Vec3 (floored). Same `{ name, boundingBox }` shape as mineflayer. */
  function blockAt (x, y, z) {
    if (x !== null && typeof x === 'object') ({ x, y, z } = x)
    const bx = Math.floor(x)
    const by = Math.floor(y)
    const bz = Math.floor(z)
    const solid = by === FLOOR_Y && solidColumn(bx, bz)
    return { name: solid ? 'stone' : 'air', boundingBox: solid ? 'block' : 'empty', position: new Vec3(bx, by, bz) }
  }

  /** True when there is solid ground under the point (x, z): the surface at y = 0 exists there. */
  function floorAt (x, z) {
    return solidColumn(Math.floor(x), Math.floor(z))
  }

  return { platform, blockAt, floorAt }
}

/**
 * Distance from the attacker's eye (feet + 1.62) to the closest point of the target's box, the way the
 * server measures reach. 0 when the eye is inside the box.
 */
function reachDistance (attackerPosition, targetPosition, targetWidth = 0.6, targetHeight = 1.8) {
  const box = entityBox(targetPosition, targetWidth, targetHeight)
  const eyeY = attackerPosition.y + EYE_HEIGHT
  const dx = Math.max(box.min.x - attackerPosition.x, 0, attackerPosition.x - box.max.x)
  const dy = Math.max(box.min.y - eyeY, 0, eyeY - box.max.y)
  const dz = Math.max(box.min.z - attackerPosition.z, 0, attackerPosition.z - box.max.z)
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

module.exports = { createWorld, reachDistance, EYE_HEIGHT }
