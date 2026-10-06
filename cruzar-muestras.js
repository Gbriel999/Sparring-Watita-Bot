'use strict'
// Matches the lab samples with the bot's setup when each fight started (peleas.jsonl), so every
// fight against the bot says its level, shield, totems and apples. Writes cruce.csv next to them.
//
//   node cruzar-muestras.js <carpeta o .zip de muestras> [--desfase-horas -3]
//
// --desfase-horas: the server's time zone as hours from UTC (the samples' "inicio" is the server's
// local time). Without it, the time zone of this PC is used.

const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const { readTimeline, settingsAt } = require('./fight-log')

function parseHeader (text) {
  const header = {}
  for (const line of text.split('\n')) {
    if (!line.startsWith('# ')) break
    const separator = line.indexOf(': ')
    if (separator > 2) header[line.slice(2, separator).trim()] = line.slice(separator + 2).trim()
  }
  return header
}

/** "yyyy-MM-dd HH:mm:ss" in the server's zone (hours from UTC, or this PC's zone when null). */
function sampleStart (text, offsetHours) {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(text || '')
  if (!match) return null
  const [, y, mo, d, h, mi, s] = match.map(Number)
  if (offsetHours === null || offsetHours === undefined) return new Date(y, mo - 1, d, h, mi, s)
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s) - offsetHours * 3600000)
}

const yesNo = (value) => value === true ? 'si' : value === false ? 'no' : ''

function crossRow (file, header, timeline, offsetHours) {
  const againstBot = /(^|\/ )bot( ·|$)/.test(header.rival || '')
  const start = sampleStart(header.inicio, offsetHours)
  const setup = againstBot && start ? settingsAt(timeline, start) : null
  return {
    muestra: file,
    tipo: header.tipo || '',
    cheat: header.cheat || '',
    rival: header.rival || '',
    inicio: header.inicio || '',
    bot_modo: setup ? setup.modo : '',
    bot_nivel: setup ? setup.nivel : '',
    bot_escudo: setup ? yesNo(setup.escudo) : '',
    bot_totem: setup ? yesNo(setup.totem) : '',
    bot_manzanas: setup ? yesNo(setup.manzanas) : ''
  }
}

function sampleFiles (dir) {
  const found = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...sampleFiles(full))
    else if (entry.name.endsWith('.csv') && !entry.name.endsWith('.events.csv') && entry.name !== 'cruce.csv') found.push(full)
  }
  return found
}

function csvCell (value) {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function main (argv) {
  const input = argv[0]
  if (!input) {
    console.log('Uso: node cruzar-muestras.js <carpeta o .zip de muestras> [--desfase-horas -3]')
    return 1
  }
  const flag = argv.indexOf('--desfase-horas')
  const offsetHours = flag >= 0 ? Number(argv[flag + 1]) : null
  let dir = path.resolve(input)
  if (dir.toLowerCase().endsWith('.zip')) {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'muestras-'))
    if (process.platform === 'win32') {
      // Not every Windows ships tar.exe, and Git's GNU tar reads "C:" as a remote host
      const quote = (p) => "'" + p.replace(/'/g, "''") + "'"
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        `Expand-Archive -LiteralPath ${quote(dir)} -DestinationPath ${quote(target)} -Force`])
    } else {
      execFileSync('unzip', ['-q', dir, '-d', target])
    }
    dir = target
  }
  const timeline = readTimeline(path.join(__dirname, 'peleas.jsonl'))
  const rows = sampleFiles(dir).map((file) => crossRow(path.relative(dir, file),
    parseHeader(fs.readFileSync(file, 'utf8').slice(0, 4000)), timeline, offsetHours))
  if (rows.length === 0) {
    console.log('No encontré muestras (.csv) en ' + dir)
    return 1
  }
  const columns = Object.keys(rows[0])
  const out = [columns.join(',')].concat(rows.map((row) => columns.map((c) => csvCell(row[c])).join(',')))
  const outFile = path.join(path.resolve(input).toLowerCase().endsWith('.zip') ? path.dirname(path.resolve(input)) : dir, 'cruce.csv')
  fs.writeFileSync(outFile, out.join('\n') + '\n')
  const matched = rows.filter((row) => row.bot_nivel).length
  const againstBot = rows.filter((row) => /(^|\/ )bot( ·|$)/.test(row.rival)).length
  console.log(`${rows.length} muestras · ${againstBot} contra el bot · ${matched} con su configuración → ${outFile}`)
  if (againstBot > matched) console.log('Algunas peleas contra el bot no tienen configuración: revisa --desfase-horas o que peleas.jsonl sea de esas fechas.')
  return 0
}

if (require.main === module) process.exitCode = main(process.argv.slice(2))

module.exports = { parseHeader, sampleStart, crossRow }
