'use strict'

// Per-rival memory: one JSON file { "<lowercase name>": { fights, savedAt, model } }.
// Writes are atomic (temp file + rename) and disk errors never throw: they return false / empty data.

const fs = require('fs')
const path = require('path')
const { OpponentModel } = require('./opponent')

function keyOf (name) {
  return String(name).trim().toLowerCase()
}

class RivalMemory {
  constructor (file) {
    this.file = file
  }

  // Reads the whole file. A missing or corrupt file counts as empty (`ok` stays true);
  // any other disk error sets `ok` to false so a save never overwrites data it could not read.
  // The table has no prototype so a rival called "__proto__" is an ordinary key.
  _read () {
    const data = Object.create(null)
    let parsed
    try {
      parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'))
    } catch (err) {
      const unreadable = err && err.code && err.code !== 'ENOENT'
      return { data, ok: !unreadable }
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const key of Object.keys(parsed)) {
        const entry = parsed[key]
        if (entry && typeof entry === 'object') data[key] = entry
      }
    }
    return { data, ok: true }
  }

  // Atomic write: temp file in the same folder, then rename over the target.
  _write (data) {
    const tmp = `${this.file}.${process.pid}.tmp`
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
      fs.renameSync(tmp, this.file)
      return true
    } catch (err) {
      try { fs.unlinkSync(tmp) } catch (e) { /* nothing to clean */ }
      return false
    }
  }

  // The remembered model of the rival, or a fresh one when there is none (or it cannot be read).
  // It comes back as a prior (half weight, see OpponentModel.fromJSON); asPrior false reads it whole,
  // for display only.
  load (name, { asPrior = true } = {}) {
    const entry = this._read().data[keyOf(name)]
    if (entry && entry.model) {
      try {
        return OpponentModel.fromJSON(entry.model, { asPrior })
      } catch (err) { /* fall through to a fresh model */ }
    }
    return new OpponentModel()
  }

  // Stores the model; `fightEnded` adds one to the fight counter. Returns false on disk errors.
  save (name, model, { fightEnded = false } = {}) {
    try {
      const { data, ok } = this._read()
      if (!ok) return false
      const key = keyOf(name)
      const previous = data[key]
      const fights = previous && Number.isFinite(previous.fights) ? previous.fights : 0
      data[key] = {
        fights: fights + (fightEnded ? 1 : 0),
        savedAt: new Date().toISOString(),
        model: model.toJSON()
      }
      return this._write(data)
    } catch (err) {
      return false
    }
  }

  // { fights, savedAt } of a remembered rival, or null.
  info (name) {
    const entry = this._read().data[keyOf(name)]
    if (!entry) return null
    return {
      fights: Number.isFinite(entry.fights) ? entry.fights : 0,
      savedAt: entry.savedAt === undefined ? null : entry.savedAt
    }
  }

  // Removes a rival; false when it was not remembered or the disk failed.
  forget (name) {
    const { data, ok } = this._read()
    const key = keyOf(name)
    if (!ok || !(key in data)) return false
    delete data[key]
    return this._write(data)
  }
}

module.exports = { RivalMemory }
