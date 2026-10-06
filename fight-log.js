'use strict'
// The bot's setup over time (peleas.jsonl): mode, level, shield, totems, apples and connection, one
// JSON line per change. The server's lab does not see how the bot was set, so each lab sample is
// matched later to the setup the bot had when the fight started (cruzar-muestras.js).

const fs = require('fs')

const KEYS = ['modo', 'nivel', 'escudo', 'totem', 'manzanas', 'conectado']

function createFightLog (file) {
  let last = null
  return {
    /** Writes the setup only when something in it changed. */
    record (settings, now = new Date()) {
      const current = {}
      for (const key of KEYS) current[key] = settings[key]
      const signature = JSON.stringify(current)
      if (signature === last) return false
      last = signature
      try {
        fs.appendFileSync(file, JSON.stringify({ t: now.toISOString(), ...current }) + '\n')
      } catch (e) {
        return false
      }
      return true
    }
  }
}

function readTimeline (file) {
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => {
    try {
      return JSON.parse(line)
    } catch (e) {
      return null
    }
  }).filter(Boolean)
}

/** The last setup written at or before the given moment, or null if the log starts later. */
function settingsAt (timeline, when) {
  let found = null
  for (const entry of timeline) {
    if (new Date(entry.t) <= when) found = entry
    else break
  }
  return found
}

module.exports = { createFightLog, readTimeline, settingsAt, KEYS }
