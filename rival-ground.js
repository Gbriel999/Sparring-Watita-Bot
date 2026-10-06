'use strict'
// mineflayer never updates onGround for other entities (prismarine-entity starts it at true), so the
// rival always looked grounded: its crits, its knockback flight and its jump resets were misread. Every
// entity move packet carries the server's flag; this copies it onto the entity.

const MOVE_PACKETS = ['rel_entity_move', 'entity_move_look', 'entity_look', 'entity_teleport', 'sync_entity_position']

function applyGroundFlag (entities, packet) {
  const entity = entities && entities[packet.entityId]
  if (!entity) return false
  entity.onGround = packet.onGround
  return true
}

function installRivalGroundFix (bot) {
  for (const name of MOVE_PACKETS) {
    bot._client.on(name, (packet) => {
      if (!packet || typeof packet.onGround !== 'boolean') return
      // mineflayer may handle the packet after us and create the entity then: retry once it did
      if (!applyGroundFlag(bot.entities, packet)) queueMicrotask(() => applyGroundFlag(bot.entities, packet))
    })
  }
}

module.exports = { installRivalGroundFix, MOVE_PACKETS }
