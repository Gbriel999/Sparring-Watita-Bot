'use strict'
// The bot's skin for the panel's 3D model: the texture the server gives its player (SkinsRestorer
// and the like set it in the tab list). Only Mojang's texture host is ever fetched.

const TEXTURE_URL = /^https?:\/\/textures\.minecraft\.net\/texture\/([0-9a-f]{16,128})$/i
const MAX_BYTES = 64 * 1024

/** mineflayer skinData ({ url, model }) → the https texture URL, or null if it is not Mojang's. */
function skinUrlOf (skinData) {
  if (!skinData || typeof skinData.url !== 'string') return null
  const match = skinData.url.match(TEXTURE_URL)
  return match ? `https://textures.minecraft.net/texture/${match[1].toLowerCase()}` : null
}

function modelOf (skinData) {
  return skinData && skinData.model === 'slim' ? 'slim' : 'default'
}

/** Downloads a skin PNG once per URL; small, PNG only. */
function createSkinCache () {
  const cache = new Map()
  return async function fetchSkin (url) {
    if (cache.has(url)) return cache.get(url)
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw new Error(`textura ${response.status}`)
    const body = Buffer.from(await response.arrayBuffer())
    const isPng = body.length > 8 && body.readUInt32BE(0) === 0x89504e47
    if (!isPng || body.length > MAX_BYTES) throw new Error('la textura no es un PNG válido')
    cache.set(url, body)
    return body
  }
}

module.exports = { skinUrlOf, modelOf, createSkinCache }
