'use strict'
// Since 1.21.9 the server sends velocity as a low precision vector already in blocks per tick, but
// mineflayer still divides it by 8000 (the old short format): the bot took about no knockback.
// mineflayer registers its own handler on a setTimeout after createBot, so it runs after any handler
// registered here; the correction is therefore applied in a microtask, once every listener of the
// packet has run and before the next physics tick.

/**
 * @param bot mineflayer bot
 * @param usesBlockVelocity () => boolean, true on 1.21.9+
 * @param onHurt called for every velocity the bot itself receives
 */
function installKnockbackFix (bot, usesBlockVelocity, onHurt) {
  bot._client.on('entity_velocity', (packet) => {
    if (!bot.entity || packet.entityId !== bot.entity.id) return
    const { x, y, z } = packet.velocity
    const real = usesBlockVelocity()
    queueMicrotask(() => {
      if (real && bot.entity) bot.entity.velocity.set(x, y, z)
      onHurt()
    })
  })
}

module.exports = { installKnockbackFix }
