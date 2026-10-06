'use strict'
// Run with: node --test
const test = require('node:test')
const assert = require('node:assert')
const { skinUrlOf } = require('./skin')

test('only Mojang texture URLs are fetched for the panel', () => {
  const hash = 'a'.repeat(64)
  assert.strictEqual(skinUrlOf({ url: `http://textures.minecraft.net/texture/${hash}` }), `https://textures.minecraft.net/texture/${hash}`)
  assert.strictEqual(skinUrlOf({ url: 'http://evil.example/texture/abc' }), null)
  assert.strictEqual(skinUrlOf({ url: 'http://textures.minecraft.net/../x' }), null)
  assert.strictEqual(skinUrlOf(undefined), null)
})

test('the slim (Alex) model is reported', () => {
  const { modelOf } = require('./skin')
  assert.strictEqual(modelOf({ model: 'slim' }), 'slim')
  assert.strictEqual(modelOf({}), 'default')
})
