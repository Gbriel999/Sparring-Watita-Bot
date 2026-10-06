'use strict'
const test = require('node:test')
const assert = require('node:assert')
const t = require('./terrain')

// Flat stone platform x,z in [-3, 3], floor at y = -1 (the bot stands at y = 0); void elsewhere
function platform (x, y, z) {
  if (y === -1 && x >= -3 && x <= 3 && z >= -3 && z <= 3) return { name: 'stone', boundingBox: 'block' }
  return { name: 'air', boundingBox: 'empty' }
}

test('move vectors follow mineflayer yaw: yaw 0 looks to -Z, left is -X', () => {
  const v = t.moveVectors(0)
  assert.ok(Math.abs(v.forward.z + 1) < 1e-9 && Math.abs(v.forward.x) < 1e-9)
  assert.ok(Math.abs(v.left.x + 1) < 1e-9)
  assert.ok(Math.abs(v.right.x - 1) < 1e-9)
  assert.ok(Math.abs(v.back.z - 1) < 1e-9)
})

test('void, lava and unloaded chunks are dangerous; solid floor is not', () => {
  assert.strictEqual(t.isDangerous(platform, 0, 0, 0), false)
  assert.strictEqual(t.isDangerous(platform, 5, 0, 0), true)
  assert.strictEqual(t.isDangerous(() => ({ name: 'lava', boundingBox: 'empty' }), 0, 0, 0), true)
  assert.strictEqual(t.isDangerous(() => null, 0, 0, 0), true)
})

test('moving toward the edge is cancelled, away from it is kept', () => {
  // At x = 2.6 facing +X (yaw = -PI/2: forward = (1, 0)): forward leads off the platform
  const out = t.safeControls({ forward: true, sprint: true, back: false, left: false, right: false },
    { position: { x: 2.6, y: 0, z: 0 }, yaw: -Math.PI / 2, blockAt: platform })
  assert.strictEqual(out.forward, false)
  assert.strictEqual(out.sprint, false)
  assert.strictEqual(out.edge, true)
  const safe = t.safeControls({ forward: false, back: true, left: false, right: false },
    { position: { x: 0, y: 0, z: 0 }, yaw: -Math.PI / 2, blockAt: platform })
  assert.strictEqual(safe.back, true)
  assert.ok(!safe.edge)
})

test('right at the edge the bot is pushed back inside', () => {
  const out = t.safeControls({ forward: false, back: false, left: false, right: false },
    { position: { x: 3.4, y: 0, z: 0 }, yaw: -Math.PI / 2, blockAt: platform })
  assert.strictEqual(out.back, true)
})

test('safeControls does not mutate its input and only drops sprint with forward', () => {
  const input = { forward: false, back: false, left: false, right: true, sprint: true }
  const frozen = Object.freeze({ ...input })
  // Facing +X at z = 2.6: right = +Z leads off the platform, sprint stays untouched
  const out = t.safeControls(frozen, { position: { x: 0, y: 0, z: 2.6 }, yaw: -Math.PI / 2, blockAt: platform })
  assert.strictEqual(out.right, false)
  assert.strictEqual(out.sprint, true)
  assert.strictEqual(out.edge, true)
  assert.deepStrictEqual(frozen, input)
})

test('a pressed direction is cancelled by the far probe alone', () => {
  // x = 2.5: the 0.8 probe (3.3) is still solid but the 1.6 probe (4.1) is void
  const out = t.safeControls({ forward: true, sprint: true }, { position: { x: 2.5, y: 0, z: 0 }, yaw: -Math.PI / 2, blockAt: platform })
  assert.strictEqual(out.forward, false)
  assert.strictEqual(out.sprint, false)
})

test('the inward push never points into danger', () => {
  // Both sides of a 1-block-wide pillar are void: nothing safe to push toward
  const pillar = (x, y, z) => (y === -1 && x === 0 && z === 0)
    ? { name: 'stone', boundingBox: 'block' }
    : { name: 'air', boundingBox: 'empty' }
  const out = t.safeControls({ forward: false, back: false, left: false, right: false },
    { position: { x: 0.5, y: 0, z: 0.5 }, yaw: 0, blockAt: pillar })
  assert.ok(!out.forward && !out.back && !out.left && !out.right)
  assert.ok(!out.edge)
})

test('hazard blocks at the feet or just below are dangerous even over solid ground', () => {
  const over = (name, yy) => (x, y) => {
    if (y === yy) return { name, boundingBox: 'empty' }
    if (y === -1) return { name: 'stone', boundingBox: 'block' }
    return { name: 'air', boundingBox: 'empty' }
  }
  assert.strictEqual(t.isDangerous(over('fire', 0), 0, 0, 0), true)
  assert.strictEqual(t.isDangerous(over('magma_block', -1), 0, 0, 0), true)
  assert.strictEqual(t.isDangerous(over('cactus', 0), 0, 0, 0), true)
  assert.strictEqual(t.isDangerous(over('sweet_berry_bush', 0), 0, 0, 0), true)
})

test('a floor up to 3 blocks below the feet still counts as ground', () => {
  const deep = (x, y) => (y === -3 ? { name: 'stone', boundingBox: 'block' } : { name: 'air', boundingBox: 'empty' })
  const tooDeep = (x, y) => (y === -4 ? { name: 'stone', boundingBox: 'block' } : { name: 'air', boundingBox: 'empty' })
  assert.strictEqual(t.isDangerous(deep, 0, 0, 0), false)
  assert.strictEqual(t.isDangerous(tooDeep, 0, 0, 0), true)
})

test('a cancelled direction is not re-enabled by the inward push on a narrow strip', () => {
  // 2-wide strip: x in [0, 1], bot at x = 0.5 facing +X. Forward's 1.6 probe (2.1) is void,
  // back's 0.8 probe (-0.3) is void too, so the inward push must not turn forward back on
  const strip = (x, y, z) => (y === -1 && x >= 0 && x <= 1 && z >= -3 && z <= 3)
    ? { name: 'stone', boundingBox: 'block' }
    : { name: 'air', boundingBox: 'empty' }
  const out = t.safeControls({ forward: true, sprint: true, back: false, left: false, right: false },
    { position: { x: 0.5, y: 0, z: 0 }, yaw: -Math.PI / 2, blockAt: strip })
  assert.strictEqual(out.forward, false)
  assert.strictEqual(out.sprint, false)
  assert.strictEqual(out.back, false)
  assert.strictEqual(out.edge, true)
})

test('a pressed direction that is dangerous at 0.8 is cancelled and its opposite is pushed', () => {
  const out = t.safeControls({ forward: true, sprint: true, back: false, left: false, right: false },
    { position: { x: 3.4, y: 0, z: 0 }, yaw: -Math.PI / 2, blockAt: platform })
  assert.strictEqual(out.forward, false)
  assert.strictEqual(out.sprint, false)
  assert.strictEqual(out.back, true)
  assert.strictEqual(out.edge, true)
})

test('edge is only reported when a control value actually changed', () => {
  // At the edge with back already pressed: the push finds nothing to change
  const out = t.safeControls({ forward: false, back: true, left: false, right: false },
    { position: { x: 3.4, y: 0, z: 0 }, yaw: -Math.PI / 2, blockAt: platform })
  assert.strictEqual(out.back, true)
  assert.ok(!out.edge)
})
