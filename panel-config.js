'use strict'
// What the panel may read and change in config.json. The login password ("clave") is write-only:
// the panel only learns whether one is saved, and an empty field keeps it. The panel token cannot
// be read or changed from the panel.

const { LEVELS } = require('./combat')

const HIDDEN = ['clave', 'panelToken']
// Changing these only takes effect on a new connection
const RECONNECT_KEYS = ['host', 'port', 'cuenta', 'auth', 'version']

const ACCOUNT_NAME = /^[A-Za-z0-9_]{3,16}$/

const RULES = {
  host: (v) => typeof v === 'string' && v.trim().length > 0 ? null : 'La IP del servidor no puede estar vacía.',
  port: (v) => Number.isInteger(v) && v >= 1 && v <= 65535 ? null : 'El puerto tiene que ser un número entre 1 y 65535.',
  cuenta: (v) => typeof v === 'string' && ACCOUNT_NAME.test(v) ? null : 'La cuenta del bot: 3 a 16 letras, números o _.',
  auth: (v) => v === 'offline' || v === 'microsoft' ? null : 'El tipo de cuenta es "offline" o "microsoft".',
  version: (v) => typeof v === 'string' && /^\d+\.\d+(\.\d+)?$/.test(v) ? null : 'La versión se escribe así: 1.21.11.',
  dueno: (v) => typeof v === 'string' && ACCOUNT_NAME.test(v) ? null : 'Tu nombre en Minecraft: 3 a 16 letras, números o _.',
  clave: (v) => typeof v === 'string' ? null : 'Clave no válida.',
  nivel: (v) => LEVELS[v] ? null : 'El nivel es facil, normal, dificil o experto.',
  escudo: bool('escudo'),
  totem: bool('totem'),
  gapple: bool('gapple'),
  avisosPorMensaje: bool('avisosPorMensaje'),
  reconectar: bool('reconectar'),
  comandoKit: (v) => typeof v === 'string' ? null : 'El comando de kit tiene que ser texto.',
  comandosAlEntrar: (v) => Array.isArray(v) && v.every((c) => typeof c === 'string') ? null : 'Los comandos al entrar son una lista de textos.'
}

function bool (key) {
  return (v) => typeof v === 'boolean' ? null : `"${key}" es sí o no.`
}

function publicConfig (config) {
  const visible = {}
  for (const [key, value] of Object.entries(config)) {
    if (!HIDDEN.includes(key)) visible[key] = value
  }
  visible.claveGuardada = typeof config.clave === 'string' && config.clave.length > 0
  return visible
}

/** @returns {{ config, restart: boolean, error?: string }} the new config, or the old one and why not */
function applyConfigPatch (config, patch) {
  const next = { ...config }
  let restart = false
  for (const [key, raw] of Object.entries(patch || {})) {
    if (!RULES[key]) continue
    const value = typeof raw === 'string' && key !== 'clave' ? raw.trim() : raw
    if (key === 'clave' && value === '') continue
    const error = RULES[key](value)
    if (error) return { config, restart: false, error }
    if (RECONNECT_KEYS.includes(key) && config[key] !== value) restart = true
    next[key] = key === 'comandosAlEntrar' ? value.map((c) => c.trim()).filter(Boolean) : value
  }
  return { config: next, restart }
}

module.exports = { publicConfig, applyConfigPatch, RECONNECT_KEYS }
