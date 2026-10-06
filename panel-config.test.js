'use strict'
// Run with: node --test
const test = require('node:test')
const assert = require('node:assert')
const { publicConfig, applyConfigPatch } = require('./panel-config')

const base = {
  host: 'mc.example.net', port: 25565, cuenta: 'Bot', auth: 'offline', version: '1.21.11', dueno: 'Owner',
  clave: 'secreta', nivel: 'normal', escudo: true, totem: true, gapple: true, panelToken: 'tok'
}

test('the panel never receives the password or its own token', () => {
  const visible = publicConfig(base)
  assert.strictEqual(visible.clave, undefined)
  assert.strictEqual(visible.panelToken, undefined)
  assert.strictEqual(visible.claveGuardada, true)
  assert.strictEqual(publicConfig({ ...base, clave: '' }).claveGuardada, false)
})

test('an empty password field keeps the saved password; a new one replaces it', () => {
  assert.strictEqual(applyConfigPatch(base, { clave: '' }).config.clave, 'secreta')
  assert.strictEqual(applyConfigPatch(base, { clave: 'otra' }).config.clave, 'otra')
})

test('unknown keys are ignored and the token cannot be changed', () => {
  const { config } = applyConfigPatch(base, { panelToken: 'x', hack: 1, nivel: 'dificil' })
  assert.strictEqual(config.panelToken, 'tok')
  assert.strictEqual(config.hack, undefined)
  assert.strictEqual(config.nivel, 'dificil')
})

test('connection changes ask for a reconnect, behaviour changes do not', () => {
  assert.strictEqual(applyConfigPatch(base, { host: 'otro.net' }).restart, true)
  assert.strictEqual(applyConfigPatch(base, { host: 'mc.example.net', escudo: false }).restart, false)
})

test('invalid values are rejected with a reason in Spanish', () => {
  assert.match(applyConfigPatch(base, { port: 70000 }).error, /puerto/i)
  assert.match(applyConfigPatch(base, { cuenta: 'a b' }).error, /cuenta/i)
  assert.match(applyConfigPatch(base, { nivel: 'imposible' }).error, /nivel/i)
})
