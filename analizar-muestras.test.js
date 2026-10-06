'use strict'
// Run with: node --test
const test = require('node:test')
const assert = require('node:assert')
const { sampleMetrics } = require('./analizar-muestras')

const csv = [
  '# tipo: Legit',
  '# rival: bot',
  'tick,pvp,crosshair,clicked,yawDelta,aimErrYaw',
  '1,1,OFF,0,2,10',
  '2,1,EDGE,1,4,-2',
  '3,1,ON,0,0,0',
  '4,0,NONE,0,0,'
].join('\n')

const events = [
  'timeMs,tick,event,data',
  '0,2,SWING,MAIN_HAND',
  '0,2,HIT,7,bot,1.0000,1,0,2.9,0.8,0',
  '0,15,SWING,MAIN_HAND',
  '0,15,HIT,7,bot,0.5000,0,1,3.1,,0',
  '0,20,SWING,MAIN_HAND',
  '0,22,FLAG,AimA (sombra),x'
].join('\n')

test('a lab sample is summed up from its ticks and events', () => {
  const m = sampleMetrics(csv, events)
  assert.strictEqual(m.tipo, 'Legit')
  assert.strictEqual(m.hits, 2)
  assert.strictEqual(m.swings, 3)
  assert.strictEqual(m.accuracy, 2 / 3)
  assert.strictEqual(m.chargedShare, 0.5)       // charge >= 0.9
  assert.strictEqual(m.critShare, 0.5)
  assert.strictEqual(m.sprintShare, 0.5)
  assert.strictEqual(m.cooldownExactShare, 1)   // the one interval is 13 ticks
  assert.strictEqual(m.onTargetShare, 2 / 3)    // pvp ticks with EDGE/ON
  assert.strictEqual(m.clicksOnTargetShare, 1)
  assert.strictEqual(m.meanAimErr, 4)           // |10|, |-2|, |0|
  assert.deepStrictEqual(m.flags, { 'AimA (sombra)': 1 })
})
