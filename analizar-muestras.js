'use strict'
// Sums up each lab sample (a folder or a .zip from muestras/) side by side: accuracy, charge and
// crits at the hit, hits exactly on the sword cooldown, aim, and the Watita flags of the fight.
//
//   node analizar-muestras.js <carpeta o .zip de muestras>

const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const { parseHeader } = require('./cruzar-muestras')

// Ticks between two charged sword hits when the player clicks the instant it is ready
const SWORD_COOLDOWN_TICKS = 13

function table (text) {
  const lines = text.split('\n').filter((line) => line && !line.startsWith('#'))
  const columns = lines[0].split(',')
  const index = Object.fromEntries(columns.map((name, i) => [name, i]))
  return { index, rows: lines.slice(1).map((line) => line.split(',')) }
}

const share = (part, total) => total > 0 ? part / total : null

function sampleMetrics (csvText, eventsText) {
  const header = parseHeader(csvText)
  const { index, rows } = table(csvText)
  let pvp = 0, onTarget = 0, clicks = 0, clicksOn = 0, aimSum = 0, aimCount = 0, turnSum = 0, turnCount = 0
  for (const row of rows) {
    if (row[index.pvp] !== '1') continue
    pvp++
    const cross = row[index.crosshair]
    const on = cross === 'ON' || cross === 'EDGE'
    if (on) onTarget++
    if (row[index.clicked] === '1') {
      clicks++
      if (on) clicksOn++
    }
    const aim = parseFloat(row[index.aimErrYaw])
    if (!Number.isNaN(aim)) { aimSum += Math.abs(aim); aimCount++ }
    const turn = parseFloat(row[index.yawDelta])
    if (!Number.isNaN(turn)) { turnSum += Math.abs(turn); turnCount++ }
  }

  let swings = 0, hits = 0, charged = 0, crits = 0, sprints = 0, exact = 0, intervals = 0, lastHitTick = null
  const distances = []
  const flags = {}
  for (const line of eventsText.split('\n').slice(1)) {
    if (!line) continue
    const f = line.split(',')
    const tick = Number(f[1])
    if (f[2] === 'SWING') swings++
    else if (f[2] === 'FLAG') flags[f[3]] = (flags[f[3]] || 0) + 1
    else if (f[2] === 'HIT') {
      // timeMs,tick,HIT,id,kind,charge,crit,sprint,distance,height,invulnerable
      hits++
      if (parseFloat(f[5]) >= 0.9) charged++
      if (f[6] === '1') crits++
      if (f[7] === '1') sprints++
      const distance = parseFloat(f[8])
      if (!Number.isNaN(distance)) distances.push(distance)
      if (lastHitTick !== null) {
        intervals++
        if (tick - lastHitTick === SWORD_COOLDOWN_TICKS) exact++
      }
      lastHitTick = tick
    }
  }
  distances.sort((a, b) => a - b)
  const pct = (q) => distances.length ? distances[Math.min(distances.length - 1, Math.floor(q * distances.length))] : null

  return {
    tipo: header.tipo || '',
    cheat: header.cheat || '',
    rival: header.rival || '',
    duracion: header.duracion || '',
    swings,
    hits,
    received: Number(header['golpes recibidos']) || 0,
    accuracy: share(hits, swings),
    chargedShare: share(charged, hits),
    critShare: share(crits, hits),
    sprintShare: share(sprints, hits),
    cooldownExactShare: share(exact, intervals),
    onTargetShare: share(onTarget, pvp),
    clicksOnTargetShare: share(clicksOn, clicks),
    meanAimErr: aimCount ? aimSum / aimCount : null,
    meanTurn: turnCount ? turnSum / turnCount : null,
    distanceP50: pct(0.5),
    distanceMax: distances.length ? distances[distances.length - 1] : null,
    flags
  }
}

function sampleFiles (dir) {
  const found = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...sampleFiles(full))
    else if (entry.name.endsWith('.csv') && !entry.name.endsWith('.events.csv') && entry.name !== 'cruce.csv') found.push(full)
  }
  return found.sort()
}

function unpack (input) {
  if (!input.toLowerCase().endsWith('.zip')) return input
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'muestras-'))
  if (process.platform === 'win32') {
    const quote = (p) => "'" + p.replace(/'/g, "''") + "'"
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -LiteralPath ${quote(input)} -DestinationPath ${quote(target)} -Force`])
  } else {
    execFileSync('unzip', ['-q', input, '-d', target])
  }
  return target
}

const percent = (value) => value === null ? '—' : `${Math.round(value * 100)}%`
const number = (value, digits = 2) => value === null ? '—' : value.toFixed(digits)

function main (argv) {
  if (!argv[0]) {
    console.log('Uso: node analizar-muestras.js <carpeta o .zip de muestras>')
    return 1
  }
  const dir = unpack(path.resolve(argv[0]))
  const files = sampleFiles(dir)
  if (files.length === 0) {
    console.log('No encontré muestras (.csv) en ' + dir)
    return 1
  }
  for (const file of files) {
    const eventsFile = file.replace(/\.csv$/, '.events.csv')
    const m = sampleMetrics(fs.readFileSync(file, 'utf8'), fs.existsSync(eventsFile) ? fs.readFileSync(eventsFile, 'utf8') : 'h\n')
    const flags = Object.entries(m.flags).sort((a, b) => b[1] - a[1]).map(([name, count]) => `${name} ×${count}`).join(', ') || 'ninguno'
    console.log(`\n${path.relative(dir, file)} · ${m.tipo} (${m.cheat}) · rival ${m.rival} · ${m.duracion}`)
    console.log(`  golpes ${m.hits}/${m.swings} swings (acierto ${percent(m.accuracy)}) · recibidos ${m.received}`)
    console.log(`  cargados ${percent(m.chargedShare)} · críticos ${percent(m.critShare)} · con sprint ${percent(m.sprintShare)} · justo a ${SWORD_COOLDOWN_TICKS} ticks ${percent(m.cooldownExactShare)}`)
    console.log(`  mira sobre el rival ${percent(m.onTargetShare)} · clics con la mira encima ${percent(m.clicksOnTargetShare)} · error medio ${number(m.meanAimErr)}° · giro medio ${number(m.meanTurn)}°/tick`)
    console.log(`  distancia mediana ${number(m.distanceP50)} · máxima ${number(m.distanceMax)}`)
    console.log(`  flags: ${flags}`)
  }
  return 0
}

if (require.main === module) process.exitCode = main(process.argv.slice(2))

module.exports = { sampleMetrics }
