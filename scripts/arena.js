'use strict'
// Bench of the combat engine in the duel simulator: one duel per level and scripted rival, and a
// table with what matters to tune it. Deterministic: the same seed always prints the same table.
//
//   npm run arena                      seed 1, 2400 ticks (two minutes), infinite floor
//   node scripts/arena.js --seed 7     another seed
//   node scripts/arena.js --plataforma 4   on a platform of blocks -4..4 (edge falls count)
//   node scripts/arena.js --sin-lag        the bot sees the rival at once (by default its updates
//                                          come every 2 ticks and late, like on a server)

const { runDuel } = require('../sim/arena')
const { RIVAL_KINDS } = require('../sim/rivals')
const { CombatEngine, LEVELS } = require('../combat')

function option (name, fallback) {
  const index = process.argv.indexOf(name)
  if (index === -1 || index + 1 >= process.argv.length) return fallback
  const value = Number(process.argv[index + 1])
  return Number.isFinite(value) ? value : fallback
}

const seed = option('--seed', 1)
const half = option('--plataforma', null)
const platform = half === null ? null : { minX: -half, maxX: half, minZ: -half, maxZ: half }
const ticks = 2400
const rivalFeed = !process.argv.includes('--sin-lag')

const engineFactory = (bot, hooks) => {
  const engine = new CombatEngine(bot, {
    getTarget: hooks.getTarget, shieldAllowed: () => true, paused: () => false, now: hooks.now, rng: hooks.rng
  })
  engine.level = hooks.level
  return engine
}

const fixed = (value, decimals) => value.toFixed(decimals).replace('.', ',')
const ratio = (part, total) => `${part}/${total}${total > 0 ? ` (${Math.round(part / total * 100)} %)` : ''}`

const header = ['nivel', 'rival', 'golpes', 'críticos', 'sprint reales', 'dist. media', 'daño hecho', 'daño recibido', 'hecho/recibido', 'caídas', 'orden paquetes']
const rows = []
for (const level of Object.keys(LEVELS)) {
  for (const rival of RIVAL_KINDS) {
    const m = runDuel({ level, rival, seed, ticks, platform, engineFactory, rivalFeed })
    rows.push([
      level,
      rival,
      String(m.hitsLanded),
      ratio(m.critsLanded, m.critAttempts),
      ratio(m.sprintHitsReal, m.sprintAttempts),
      fixed(m.avgHitDistance, 2),
      fixed(m.damageDealt, 0),
      fixed(m.damageTaken, 0),
      fixed(m.damageDealt / Math.max(1, m.damageTaken), 2),
      String(m.edgeFalls),
      String(m.packetOrderViolations)
    ])
  }
}

const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column].length)))
const line = (cells) => cells.map((cell, column) => column < 2 ? cell.padEnd(widths[column]) : cell.padStart(widths[column])).join('  ')
console.log(`Arena: semilla ${seed}, ${ticks} ticks, ${platform ? `plataforma ${-half}..${half}` : 'suelo infinito'}, ${rivalFeed ? 'rival con lag de servidor' : 'rival sin lag'}`)
console.log(line(header))
console.log(widths.map((width) => '-'.repeat(width)).join('  '))
let previous = null
for (const row of rows) {
  if (previous !== null && row[0] !== previous) console.log('')
  previous = row[0]
  console.log(line(row))
}
