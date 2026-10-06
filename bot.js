'use strict'
// Sparring bot for the WatitaAC lab: the second account connects as a real client and fights the
// owner (or moves around him without hitting) so the lab records fights against a moving rival.
// The fighting itself is combat.js: human-like 1.9+ PvP, nothing a vanilla player could not do.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const readline = require('readline')
const mineflayer = require('mineflayer')
const { CombatEngine, LEVELS } = require('./combat')
const { RivalMemory } = require('./brain/memory')
const { installKnockbackFix } = require('./knockback')
const { startPanelServer } = require('./panel-server')
const { InputLog, FrameMeter } = require('./panel-telemetry')
const { publicConfig, applyConfigPatch } = require('./panel-config')
const { CombatStats } = require('./combat-stats')
const { skinUrlOf, modelOf, createSkinCache } = require('./skin')
const { createFightLog } = require('./fight-log')

// What the engine learned about each rival, kept between sessions (gitignored)
const rivalMemory = new RivalMemory(path.join(__dirname, 'rivales.json'))

const configPath = path.join(__dirname, 'config.json')
if (!fs.existsSync(configPath)) {
  console.error('Falta config.json: copia config.example.json a config.json y rellénalo.')
  process.exit(1)
}
let config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
if (!config.host || !config.cuenta || !config.dueno) {
  console.error('config.json necesita al menos "host", "cuenta" y "dueno".')
  process.exit(1)
}

// Never ends with a command: an echo of it in chat must not be read as one
const HELP = '!pelea · !muevete · !para · !donde · !equipar · !kit · !inventario · !totem on|off · !gapple on|off · '
  + '!nivel facil|normal|dificil|experto · !escudo on|off · !olvidar · !diag · !reiniciar · !ayuda (en el chat, la terminal o el panel).'

let bot = null
let engine = null
let level = LEVELS[config.nivel] ? config.nivel : 'normal'
let useShield = config.escudo !== false
let lastCommand = { text: '', at: 0 }
let lastDiagnostics = ''

const logFile = path.join(__dirname, 'bot.log')
const recentLines = [] // the panel's log, newest last
const logListeners = []
const eventListeners = []

function log (message) {
  const line = `[${new Date().toLocaleTimeString('es-ES', { hour12: false })}] ${message}`
  console.log(line)
  try { fs.appendFileSync(logFile, line + '\n') } catch (e) { /* the console still has it */ }
  recentLines.push(line)
  if (recentLines.length > 200) recentLines.shift()
  for (const listener of logListeners) listener(line)
}

function emit (event) {
  for (const listener of eventListeners) listener(event)
}

function saveConfig () {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n')
  } catch (e) {
    log(`No pude guardar config.json: ${e.message}`)
  }
}

/** Settings changed by a command are remembered for the next start. */
function remember (key, value) {
  if (config[key] === value) return
  config[key] = value
  saveConfig()
}

/** Answer to the owner: console always, private message when "avisosPorMensaje" is on. */
function say (message) {
  log(message)
  if (bot && config.avisosPorMensaje) {
    try { bot.whisper(config.dueno, message) } catch (e) { /* not connected yet */ }
  }
}

/** The owner in the player list, ignoring case (chat and tab may show the name differently). */
function ownerPlayer () {
  if (!bot || !bot.players) return null
  const wanted = config.dueno.toLowerCase()
  for (const name of Object.keys(bot.players)) {
    if (name.toLowerCase() === wanted) return bot.players[name]
  }
  return null
}

function ownerEntity () {
  const owner = ownerPlayer()
  return owner && owner.entity ? owner.entity : null
}

/** Why the owner cannot be fought right now, for the reply. */
function whyNoOwner () {
  if (!ownerPlayer()) return `No estás en mi servidor. Tráeme con /send ${bot.username} <servidor> y vuelve a escribir el comando.`
  return 'Estás demasiado lejos (no te veo): acércate a menos de 30 bloques.'
}

// An exception in the engine must not kill the bot: each distinct message is logged once, and the
// keys are released so the bot does not keep running or holding the shield
const engineErrors = new Set()

function guarded (what, fn) {
  try {
    fn()
  } catch (e) {
    const message = `${what}: ${e && e.message ? e.message : e}`
    if (!engineErrors.has(message)) {
      engineErrors.add(message)
      log(`Error del motor de combate (${message}). Suelto las teclas y sigo.`)
      if (e && e.stack) console.error(e.stack)
    }
    try { if (engine) engine.releaseControls() } catch (err) { /* nothing more to do */ }
  }
}

function modeName () {
  return engine && engine.mode ? engine.mode : 'quieto'
}

// ---- Equipment: armor, weapon, totems and golden apples ----------------------------------------

const ARMOR_TIERS = ['netherite', 'diamond', 'iron', 'chainmail', 'golden', 'leather']
const WEAPON_TIERS = ['netherite', 'diamond', 'iron', 'stone', 'golden', 'wooden']
const ARMOR_SLOTS = { head: '_helmet', torso: '_chestplate', legs: '_leggings', feet: '_boots' }
const OFF_HAND_SLOT = 45

let useTotem = config.totem !== false
let useGapple = config.gapple !== false
let eating = false
let equipping = false

function tierOf (name, tiers) {
  const index = tiers.findIndex((tier) => name.startsWith(tier + '_'))
  return index === -1 ? (name === 'turtle_helmet' ? 4 : 99) : index
}

function countItem (name) {
  if (!bot || !bot.inventory) return 0
  const inBag = bot.inventory.items().filter((item) => item.name === name).reduce((sum, item) => sum + item.count, 0)
  const offHand = bot.inventory.slots[OFF_HAND_SLOT]
  return inBag + (offHand && offHand.name === name ? offHand.count : 0)
}

function best (items, tiers) {
  return items.slice().sort((a, b) => tierOf(a.name, tiers) - tierOf(b.name, tiers))[0]
}

async function equipArmor () {
  for (const [destination, suffix] of Object.entries(ARMOR_SLOTS)) {
    const candidates = bot.inventory.items().filter((item) => item.name.endsWith(suffix)
      || (destination === 'head' && item.name === 'turtle_helmet'))
    const item = best(candidates, ARMOR_TIERS)
    if (!item) continue
    const worn = bot.inventory.slots[bot.getEquipmentDestSlot(destination)]
    if (!worn || tierOf(item.name, ARMOR_TIERS) < tierOf(worn.name, ARMOR_TIERS)) await bot.equip(item, destination)
  }
}

async function equipWeapon () {
  const items = bot.inventory.items()
  const weapon = best(items.filter((item) => item.name.endsWith('_sword')), WEAPON_TIERS)
    || best(items.filter((item) => item.name.endsWith('_axe')), WEAPON_TIERS)
  if (weapon && (!bot.heldItem || bot.heldItem.name !== weapon.name)) await bot.equip(weapon, 'hand')
}

async function equipOffHand () {
  const offHand = bot.inventory.slots[OFF_HAND_SLOT]
  const wanted = useTotem && countItem('totem_of_undying') > 0 ? 'totem_of_undying' : (useShield ? 'shield' : null)
  if (!wanted || (offHand && offHand.name === wanted)) return
  const item = bot.inventory.items().find((candidate) => candidate.name === wanted)
  if (item) await bot.equip(item, 'off-hand')
}

/**
 * Best armor, best sword (or axe) and the totem or shield in the off hand. The main hand is left
 * alone during a fight: the combat engine switches to the axe against shields.
 */
async function equipAll (withWeapon = true) {
  if (!bot || !bot.entity || equipping || eating) return
  equipping = true
  try {
    await equipArmor()
    if (withWeapon) await equipWeapon()
    await equipOffHand()
  } catch (e) {
    log(`No pude equiparme: ${e.message}`)
  } finally {
    equipping = false
  }
}

function inventorySummary () {
  const worn = Object.keys(ARMOR_SLOTS).map((destination) => bot.inventory.slots[bot.getEquipmentDestSlot(destination)])
    .filter(Boolean).map((item) => item.name.replace(/_(helmet|chestplate|leggings|boots)$/, ''))
  const offHand = bot.inventory.slots[OFF_HAND_SLOT]
  return `Armadura: ${worn.length ? worn.join(', ') : 'ninguna'} · mano: ${bot.heldItem ? bot.heldItem.name : 'nada'}`
    + ` · izquierda: ${offHand ? offHand.name : 'nada'} · tótems: ${countItem('totem_of_undying')}`
    + ` · manzanas: ${countItem('golden_apple') + countItem('enchanted_golden_apple')}`
}

/** Low health: eat a golden apple (enchanted first), then back to the weapon and the fight. */
async function maybeEat () {
  if (!useGapple || eating || equipping || !bot.entity || bot.health > 10) return
  const apple = bot.inventory.items().find((item) => item.name === 'enchanted_golden_apple')
    || bot.inventory.items().find((item) => item.name === 'golden_apple')
  if (!apple) return
  eating = true
  try {
    if (engine) engine.releaseControls()
    await bot.equip(apple, 'hand')
    await bot.consume()
    log(`Comí ${apple.name} (vida ${Math.round(bot.health)}).`)
  } catch (e) {
    log(`No pude comer: ${e.message}`)
  } finally {
    eating = false
    await equipWeapon().catch(() => {})
  }
}

/** Totem popped (entity status 35): another one in the off hand after a human-like delay. */
function onTotemPop () {
  log(`¡Tótem usado! Quedan ${countItem('totem_of_undying')}.`)
  if (useTotem) setTimeout(() => equipOffHand().catch(() => {}), 300 + Math.random() * 400)
}

// ---- Commands ----------------------------------------------------------------------------------

function handle (raw) {
  const text = raw.trim()
  const now = Date.now()
  if (text === lastCommand.text && now - lastCommand.at < 1000) return // same command seen twice (chat + server echo)
  lastCommand = { text, at: now }
  const [command, arg] = text.toLowerCase().split(/\s+/)
  if (!bot || !bot.entity) {
    if (command === '!reiniciar') resetSession()
    else if (command === '!olvidar') forgetRival()
    else log('No estoy conectado al servidor: conéctame primero.')
    return
  }

  if (command === '!pelea') {
    if (!ownerEntity()) return say(whyNoOwner())
    equipWeapon().catch(() => {})
    engine.start('pelea')
    say(`Peleando contra ${config.dueno} (nivel ${level}, escudo ${useShield ? 'sí' : 'no'}).`)
  } else if (command === '!muevete') {
    if (!ownerEntity()) return say(whyNoOwner())
    engine.start('muevete')
    say('Me muevo a tu alrededor sin pegar.')
  } else if (command === '!para') {
    engine.stop()
    say('Parado.')
  } else if (command === '!donde') {
    const p = bot.entity.position
    const owner = ownerEntity()
    say(`Estoy en ${bot.game.dimension} (${Math.round(p.x)}, ${Math.round(p.y)}, ${Math.round(p.z)}). `
      + (owner ? `Te veo a ${Math.round(p.distanceTo(owner.position))} bloques.` : whyNoOwner()))
  } else if (command === '!nivel') {
    if (!LEVELS[arg]) return say('Niveles: facil, normal, dificil, experto.')
    level = arg
    engine.level = level
    remember('nivel', level)
    const s = LEVELS[level]
    say(`Nivel ${level}: reacción ${s.reactionMs[0]}-${s.reactionMs[1]} ms, ${Math.round(s.missChance * 100)}% de fallos.`)
  } else if (command === '!escudo') {
    useShield = arg !== 'off'
    remember('escudo', useShield)
    equipOffHand().catch(() => {})
    say(`Escudo ${useShield ? 'activado' : 'desactivado'}.`)
  } else if (command === '!equipar') {
    equipAll().then(() => say(inventorySummary()))
  } else if (command === '!kit') {
    if (!config.comandoKit) return say('Pon el comando de kit en config.json ("comandoKit", ej. "/kit pvp").')
    bot.chat(config.comandoKit)
    setTimeout(() => equipAll().then(() => say(inventorySummary())), 1500)
  } else if (command === '!inventario') {
    say(inventorySummary())
  } else if (command === '!diag') {
    say(lastDiagnostics || 'Todavía midiendo (10 s).')
  } else if (command === '!totem') {
    useTotem = arg !== 'off'
    remember('totem', useTotem)
    equipOffHand().catch(() => {})
    say(`Tótems ${useTotem ? 'activados: siempre uno en la mano izquierda' : 'desactivados'} (tengo ${countItem('totem_of_undying')}).`)
  } else if (command === '!gapple') {
    useGapple = arg !== 'off'
    remember('gapple', useGapple)
    say(`Manzanas doradas ${useGapple ? 'activadas: como una con poca vida' : 'desactivadas'}.`)
  } else if (command === '!reiniciar') {
    resetSession()
    say('Contadores de la sesión a cero.')
  } else if (command === '!olvidar') {
    forgetRival()
  } else if (command === '!ayuda') {
    say(HELP)
  }
}

/**
 * Wipes what the bot learned about the owner, on disk and in the engine. Works offline too, even before
 * the first connection (then only the memory file holds anything).
 */
function forgetRival () {
  const stored = rivalMemory.info(config.dueno) !== null
  const forgotten = engine ? engine.forgetOpponent() : (!stored || rivalMemory.forget(config.dueno))
  if (!forgotten) say(`No pude borrar lo que sabía de ${config.dueno}: revisa rivales.json.`)
  else if (!engine && !stored) say(`No tenía nada guardado de ${config.dueno}.`)
  else say(`Olvidé lo que sabía de ${config.dueno}.`)
}

// Login plugins of non-premium servers (AuthMe, nLogin...): register once, then log in, with the
// password the owner wrote in config.json ("clave"). A few tries at most, never in a loop.
let authTries = 0

function handleLogin (line) {
  const lower = line.toLowerCase()
  if (!config.clave) {
    if (lower.includes('/register') || lower.includes('/login')) {
      // Without a password the login plugin would kick it and it would reconnect forever
      log('El servidor pide login y config.json no tiene "clave": escribe la clave del bot y vuelve a iniciarlo.')
      manualStop = true
      bot.quit()
      return true
    }
    return false
  }
  if (authTries >= 3) return false
  if (lower.includes('/register') || lower.includes('/registrar')) {
    authTries++
    bot.chat(`/register ${config.clave} ${config.clave}`)
    log('Servidor pide registro: registrando la cuenta del bot.')
    return true
  }
  if (lower.includes('/login')) {
    authTries++
    bot.chat(`/login ${config.clave}`)
    log('Servidor pide login: iniciando sesión.')
    return true
  }
  return false
}

/** Finds "!command [arg]" in any chat line that names the owner (chat plugins change the format). */
function commandFrom (line) {
  if (!line.toLowerCase().includes(config.dueno.toLowerCase())) return null
  const match = line.match(/(![a-z]+(?:\s+[a-z]+)?)\s*$/i)
  return match ? match[1] : null
}

/** 1.21.9+ sends velocities as LpVec3 (blocks per tick), older versions as shorts (1/8000). */
function usesBlockVelocity () {
  try {
    return bot.registry.version['>=']('1.21.9')
  } catch (e) {
    return false
  }
}

// ---- Connection --------------------------------------------------------------------------------

let status = 'desconectado' // 'conectando' | 'conectado' | 'esperando' (to reconnect) | 'desconectado'
let manualStop = false
let reconnectTimer = null
let connectedAt = 0

// What the panel shows: session counters (until !reiniciar), the input log and the frame meter
let session = null
const combatStats = new CombatStats()
const fetchSkin = createSkinCache()
const inputLog = new InputLog(16)
const frameMeter = new FrameMeter(60)
let attackThisTick = null
let hurtThisTick = false
let ticksPerSecond = 0

let lastHurtAt = 0

/** The bot's own player in the tab list carries its skin texture. */
function botSkinData () {
  if (!bot || !bot.username || !bot.players || !bot.players[bot.username]) return undefined
  return bot.players[bot.username].skinData
}

function skinState () {
  const data = botSkinData()
  const url = skinUrlOf(data)
  // The id changes with the texture, so the panel reloads the model only when it changes
  return url ? { id: url.slice(-16), model: modelOf(data) } : null
}

async function panelSkin () {
  const url = skinUrlOf(botSkinData())
  return url ? fetchSkin(url) : null
}

function resetSession () {
  session = { knockbacks: 0, lastKnockback: 0 }
  combatStats.reset(Date.now())
}
resetSession()

function createBot () {
  clearTimeout(reconnectTimer)
  reconnectTimer = null
  manualStop = false
  authTries = 0
  status = 'conectando'
  bot = mineflayer.createBot({
    host: config.host,
    port: config.port || 25565,
    username: config.cuenta,
    auth: config.auth || 'microsoft',
    version: config.version || false,
    profilesFolder: path.join(__dirname, '.auth')
  })
  engine = new CombatEngine(bot, {
    getTarget: ownerEntity,
    shieldAllowed: () => useShield,
    paused: () => eating,
    log: say,
    memory: rivalMemory,
    opponentName: () => config.dueno,
    onAttack: (kind) => {
      if (kind === 'air') combatStats.swingAir(Date.now())
      else combatStats.attack(kind, Date.now())
      attackThisTick = kind
      emit({ kind, at: Date.now() })
    }
  })
  engine.level = level

  bot.once('spawn', () => {
    status = 'conectado'
    connectedAt = Date.now()
    for (const command of config.comandosAlEntrar || []) bot.chat(command)
    log(`Conectado como ${bot.username}. Dueño: ${config.dueno}. Comandos: ${HELP}`)
  })

  bot.on('physicsTick', () => guarded('tick', () => engine.onPhysicsTick()))
  // After the engine: what it pressed and swung on this tick
  bot.on('physicsTick', () => {
    const controls = { ...bot.controlState, shield: engine.shieldUp }
    inputLog.push(controls, attackThisTick)
    frameMeter.push(engine.charge().value, attackThisTick, hurtThisTick)
    attackThisTick = null
    hurtThisTick = false
  })
  bot.on('entitySwingArm', (entity) => {
    const owner = ownerEntity()
    if (owner && entity.id === owner.id) guarded('swing del rival', () => engine.onTargetSwing())
  })

  // Real knockback on 1.21.9+ (mineflayer divides it by 8000), see knockback.js
  let knockbacks = 0
  let lastKnockback = 0
  installKnockbackFix(bot, usesBlockVelocity, () => {
    knockbacks++
    lastKnockback = Math.hypot(bot.entity.velocity.x, bot.entity.velocity.z)
    session.knockbacks++
    session.lastKnockback = lastKnockback
    hurtThisTick = true
    emit({ kind: 'kb', strength: lastKnockback, at: Date.now() })
    guarded('knockback', () => engine.onHurt())
  })

  // Damage confirmed by the server (damage_event): the owner's confirms the bot's hits, the bot's
  // own is a hit received; the health update carries how much it lost
  // source (who caused it) may be missing; then it is assumed to be the owner's hit
  bot.on('entityHurt', (entity, source) => {
    if (!entity || !bot.entity) return
    const owner = ownerEntity()
    if (owner && entity.id === owner.id) {
      combatStats.targetHurt(Date.now())
      emit({ kind: 'landed', at: Date.now() })
      guarded('golpe dado', () => engine.onTargetHurt())
    } else if (entity.id === bot.entity.id) {
      combatStats.selfHurt(0, Date.now())
      lastHurtAt = Date.now()
      hurtThisTick = true
      emit({ kind: 'hurt', at: lastHurtAt })
      const byTarget = Boolean(source && owner && source.id === owner.id) || !source
      guarded('golpe recibido', () => engine.onSelfHurt({ byTarget }))
    }
  })
  let lastHealth = null
  bot.on('health', () => {
    if (lastHealth !== null) combatStats.healthLost(lastHealth - bot.health)
    lastHealth = bot.health
  })
  bot.on('respawn', () => {
    lastHealth = null
    // A respawn moves the bot: the engine starts its position bookkeeping over from here
    guarded('reaparición', () => engine.resync())
  })

  // Diagnostics: server teleports (anticheat setbacks look like this from the client), ping and
  // physics ticks per second, logged every 10 s while something is going on
  let forcedMoves = 0
  let physicsTicks = 0
  let ticksThisSecond = 0
  bot.on('forcedMove', () => {
    forcedMoves++
    // A server teleport (or an anticheat setback) moves the bot without a move of its own
    guarded('teletransporte', () => engine.resync())
  })
  bot.on('physicsTick', () => { physicsTicks++; ticksThisSecond++ })
  const perSecond = setInterval(() => {
    ticksPerSecond = ticksThisSecond
    ticksThisSecond = 0
  }, 1000)
  const diagnostics = setInterval(() => {
    const s = engine.takeStats()
    lastDiagnostics = `ping ${bot.player ? bot.player.ping : '?'} ms · ${Math.round(physicsTicks / 10)} ticks/s`
      + ` · ${forcedMoves} teletransportes del servidor en 10 s · modo ${modeName()}`
      + (modeName() === 'pelea' ? ` · golpes ${s.hits} (críticos ${s.crits}, con sprint ${s.sprintHits}, al aire ${s.air})`
        + ` · arma ${bot.heldItem ? bot.heldItem.name : 'ninguna'}` : '')
      + (knockbacks > 0 ? ` · knockbacks recibidos ${knockbacks} (último ${lastKnockback.toFixed(2)} bloques/tick)` : '')
    knockbacks = 0
    if (forcedMoves > 0 || modeName() !== 'quieto') log(lastDiagnostics)
    forcedMoves = 0
    physicsTicks = 0
  }, 10000)

  // Every spawn (join, respawn, server switch): put on whatever it has
  bot.on('spawn', () => setTimeout(() => equipAll().catch(() => {}), 2000))

  // Keeps itself equipped: new items given to it, broken armor, the totem after a pop
  const upkeep = setInterval(() => {
    if (bot.entity) equipAll(modeName() !== 'pelea').catch(() => {})
  }, 3000)
  bot.on('health', () => { maybeEat().catch(() => {}) })
  bot._client.on('entity_status', (packet) => {
    if (bot.entity && packet.entityId === bot.entity.id && packet.entityStatus === 35) {
      combatStats.totemPop()
      emit({ kind: 'totem', at: Date.now() })
      onTotemPop()
    }
  })

  bot.on('messagestr', (line) => {
    if (handleLogin(line)) return
    const command = commandFrom(line)
    if (command) handle(command)
  })

  bot.on('death', () => {
    combatStats.death()
    emit({ kind: 'death', at: Date.now() })
    log('He muerto.')
  })
  bot.on('kicked', (reason) => log(`Expulsado: ${typeof reason === 'string' ? reason : JSON.stringify(reason)}`))
  bot.on('error', (err) => log(`Error: ${err.message}`))
  bot.on('end', (reason) => {
    log(`Desconectado (${reason}).`)
    clearInterval(diagnostics)
    clearInterval(upkeep)
    clearInterval(perSecond)
    ticksPerSecond = 0
    if (engine) {
      // A dropped connection must not lose what was learned since the last periodic save
      guarded('guardar al desconectar', () => { if (engine.mode) engine.saveModel(engine.mode === 'pelea') })
      engine.mode = null
    }
    if (!manualStop && config.reconectar !== false) {
      status = 'esperando'
      log('Reconectando en 10 s...')
      reconnectTimer = setTimeout(createBot, 10000)
    } else {
      status = 'desconectado'
    }
  })
}

function isConnecting () {
  return status === 'conectado' || status === 'conectando'
}

function connect () {
  if (!isConnecting()) createBot()
}

function disconnect () {
  manualStop = true
  clearTimeout(reconnectTimer)
  reconnectTimer = null
  if (bot && isConnecting()) {
    if (engine) engine.stop()
    bot.quit()
    log('Desconectado desde el panel.')
  }
  status = 'desconectado'
}

/** Disconnects and connects again once the old connection has closed. */
function reconnect () {
  if (bot && isConnecting()) {
    bot.once('end', () => setTimeout(createBot, 500))
    disconnect()
  } else {
    createBot()
  }
}

// ---- Panel -------------------------------------------------------------------------------------

function itemName (item) {
  return item ? item.name : null
}

function panelState () {
  const online = Boolean(bot && bot.entity && status === 'conectado')
  const owner = online ? ownerPlayer() : null
  const ownerBody = owner && owner.entity ? owner.entity : null
  const charge = engine ? engine.charge() : { value: 0, cooldown: 0 }
  const position = online ? bot.entity.position : null
  return {
    status,
    connectedAt,
    server: config.host + (config.port && config.port !== 25565 ? `:${config.port}` : ''),
    version: config.version || 'auto',
    account: config.cuenta,
    ownerName: config.dueno,
    ping: online && bot.player ? bot.player.ping : null,
    ticksPerSecond: online ? ticksPerSecond : null,
    dimension: online && bot.game ? String(bot.game.dimension || '').replace('minecraft:', '') : null,
    position: position ? { x: Math.round(position.x), y: Math.round(position.y), z: Math.round(position.z) } : null,
    owner: {
      inServer: Boolean(owner),
      visible: Boolean(ownerBody),
      distance: ownerBody ? Math.round(position.distanceTo(ownerBody.position) * 10) / 10 : null
    },
    mode: modeName(),
    level,
    toggles: { shield: useShield, totem: useTotem, gapple: useGapple },
    health: online ? Math.round(bot.health * 10) / 10 : null,
    food: online ? bot.food : null,
    equipment: online
      ? {
          head: itemName(bot.inventory.slots[bot.getEquipmentDestSlot('head')]),
          torso: itemName(bot.inventory.slots[bot.getEquipmentDestSlot('torso')]),
          legs: itemName(bot.inventory.slots[bot.getEquipmentDestSlot('legs')]),
          feet: itemName(bot.inventory.slots[bot.getEquipmentDestSlot('feet')]),
          main: itemName(bot.heldItem),
          off: itemName(bot.inventory.slots[OFF_HAND_SLOT]),
          totems: countItem('totem_of_undying'),
          gapples: countItem('golden_apple') + countItem('enchanted_golden_apple')
        }
      : null,
    eating,
    controls: online ? { ...bot.controlState, shield: Boolean(engine && engine.shieldUp) } : {},
    charge: { value: Math.round(charge.value * 100) / 100, cooldown: charge.cooldown },
    inputs: inputLog.entries(),
    frames: frameMeter.frames(),
    session: { ...combatStats.snapshot(Date.now()), ...session },
    body: online
      ? { onGround: bot.entity.onGround, pitch: Math.round(bot.entity.pitch * 100) / 100, hurtAt: lastHurtAt }
      : null,
    skin: skinState(),
    rival: engine ? engine.rivalSummary() : null
  }
}

function panelToken () {
  if (typeof config.panelToken !== 'string' || config.panelToken.length < 12) {
    config.panelToken = crypto.randomBytes(12).toString('base64url')
    saveConfig()
  }
  return config.panelToken
}

/** Settings from the panel's configuration section. */
function saveFromPanel (patch) {
  const result = applyConfigPatch(config, patch)
  if (result.error) return { ok: false, error: result.error }
  const passwordChanged = result.config.clave !== config.clave
  config = result.config
  saveConfig()
  // Live settings follow the saved ones
  if (LEVELS[config.nivel]) level = config.nivel
  if (engine) engine.level = level
  useShield = config.escudo !== false
  useTotem = config.totem !== false
  useGapple = config.gapple !== false
  log(passwordChanged ? 'Configuración guardada desde el panel (clave del bot cambiada).' : 'Configuración guardada desde el panel.')
  return { ok: true, restart: result.restart && status !== 'desconectado', config: publicConfig(config) }
}

const panel = startPanelServer({
  token: panelToken(),
  port: Number.isInteger(config.panelPuerto) ? config.panelPuerto : 3210,
  state: panelState,
  logs: () => recentLines.slice(),
  onLog: (listener) => logListeners.push(listener),
  onEvent: (listener) => eventListeners.push(listener),
  command: (text) => handle(text),
  connect,
  disconnect,
  reconnect,
  skin: panelSkin,
  config: () => publicConfig(config),
  saveConfig: saveFromPanel
})
panel.server.on('error', (err) => log(`El panel no pudo abrirse: ${err.message}`))
panel.server.on('listening', () => {
  log(`Panel en este PC: ${panel.urls.local}`)
  if (panel.urls.lan) log(`Panel en el móvil (misma Wi-Fi): ${panel.urls.lan}`)
})

// The bot's setup over time, to match each lab sample with how its rival was set (peleas.jsonl)
const fightLog = createFightLog(path.join(__dirname, 'peleas.jsonl'))
setInterval(() => {
  fightLog.record({
    modo: modeName(),
    nivel: level,
    escudo: useShield,
    totem: useTotem,
    manzanas: useGapple,
    conectado: status === 'conectado'
  })
}, 1000)

// Commands can also be typed in this terminal
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (line.trim().startsWith('!') && bot) handle(line)
})

createBot()
