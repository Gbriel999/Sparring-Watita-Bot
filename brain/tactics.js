'use strict'

// Pure tactical decisions for the sparring bot: hit style, crit jump plan, spacing,
// w-tap / s-tap after a hit, strafe, shield and combo break. Every function returns a
// Spanish `reason` string that the web panel shows; the combat engine calls them each tick.
const { PHYS, planCritJump, knockbackDisplacement, ticksToCover } = require('./physics')

// Keeps x inside [lo, hi].
function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x))
}

// Linear mix where w = 1 gives `a` and w = 0 gives `b`.
function blend(a, b, w) {
  return b + (a - b) * w
}

// Number with a decimal comma and a fixed amount of decimals, for the panel text.
function fmt(n, decimals) {
  return n.toFixed(decimals).replace('.', ',')
}

// Reach the rival is believed to have: the farthest it usually hits from (the 90th percentile of
// its landed hits, never below the median), or the vanilla maximum while unknown. The median alone
// underestimates it: most hits land closer than the reach a player can really use.
function enemyReachOf(model) {
  return model.reach ? Math.max(model.reach.median, model.reach.p90 ?? 0) : PHYS.MAX_REACH
}

// Picks between a crit (jump) hit and a sprint hit. Rules apply in order, first one wins.
function chooseHitStyle(ctx, model, s, rng) {
  const { distance, closingSpeed, comboFor } = ctx
  if (distance > 4.2) return { style: 'sprint', reason: 'Sprint: estás lejos, hay que entrar' }
  if (closingSpeed < -0.15) return { style: 'sprint', reason: 'Sprint: te alejas, te persigo' }

  const w = s.modelWeight
  const confidence = model.confidence
  if (
    model.jumpResetRate !== null &&
    confidence.jumpReset >= 0.4 &&
    model.jumpResetRate >= 0.5 &&
    rng() < w
  ) {
    return { style: 'crit', reason: `Críticos: haces jump reset el ${Math.round(model.jumpResetRate * 100)} %` }
  }
  if (
    model.kbFactor !== null &&
    confidence.kb >= 0.4 &&
    model.kbFactor < 0.6 &&
    rng() < w
  ) {
    return { style: 'crit', reason: `Críticos: te llevas poco KB (×${fmt(model.kbFactor, 2)})` }
  }

  if (comboFor >= 2) return { style: 'sprint', reason: 'Sprint: sigo el combo' }
  if (rng() < s.critChance) return { style: 'crit', reason: 'Crítico' }
  return { style: 'sprint', reason: 'Golpe con sprint' }
}

// Spam-clicker read: a rival whose swings mostly come under 10 ticks apart hits with little charge,
// so holding back and retreating only gives it time; trading charged hits (crits when possible) wins.
// Levels trust the read in proportion to their model weight.
const SPAM_TRADE_RATE = 0.5
const SPAM_TRADE_CONFIDENCE = 0.4
function planTrade(model, s, rng) {
  const trade =
    model.spamRate !== null &&
    model.spamRate >= SPAM_TRADE_RATE &&
    model.confidence.rhythm >= SPAM_TRADE_CONFIDENCE &&
    rng() < s.modelWeight
  return {
    trade,
    reason: trade ? `Cambio golpes: spameas (${Math.round(model.spamRate * 100)} %) y tus golpes pegan poco` : ''
  }
}

// Plans the crit jump; a low level adds noise to the jump timing so it sometimes misses the window.
function planCrit(ctx, s, rng) {
  const plan = planCritJump({
    untilReady: ctx.untilReady,
    distance: ctx.distance,
    closingSpeed: ctx.closingSpeed
  })
  if (!plan) return null
  if (s.planNoise > 0) {
    const noise = Math.floor(rng() * (2 * s.planNoise + 1)) - s.planNoise
    return { jumpIn: Math.max(0, plan.jumpIn + noise), attackAt: plan.attackAt }
  }
  return plan
}

// Spacing ("reach dance"): hold just outside the rival reach while waiting for the charge,
// then walk in so the swing lands at the hit distance.
function planSpacing(ctx, model, s) {
  const { distance, untilReady, enemyReadyIn, style } = ctx
  const enemyReach = enemyReachOf(model)
  const hold = clamp(3.0 + (enemyReach - 3.0) * s.modelWeight + s.holdMargin, 3.05, 3.7)
  const approachTicks = ticksToCover(distance - s.hitDistance, { sprint: style === 'sprint' })

  if (untilReady > approachTicks + 1) {
    // Waiting for our own charge.
    if (enemyReadyIn !== null && enemyReadyIn <= 2 && distance < enemyReach + 0.2) {
      return { forward: false, back: true, sprint: false, reason: 'Atrás: tu espada está cargada' }
    }
    const forward = distance > hold + 0.25
    const back = distance < hold - 0.25
    const reason = model.reach
      ? `Me quedo a ${fmt(hold, 1)}: llegas hasta ${fmt(enemyReach, 1)}`
      : `Me quedo a ${fmt(hold, 1)}`
    return { forward, back, sprint: false, reason }
  }

  // Charge is about to be ready: go in and hit.
  const forward = distance > s.hitDistance
  return {
    forward,
    back: false,
    sprint: forward && style === 'sprint',
    reason: `Entro para pegar a ${fmt(s.hitDistance, 1)}`
  }
}

// Movement right after landing a hit: w-tap to re-arm the sprint, s-tap when the knockback
// leaves the rival too close, computed from the knockback physics when the level can predict it.
// `trade` (optional): this recharge trades hits with a spam-clicker, so there is no s-tap to avoid its hit.
function planAfterHit(ctx, model, s, rng) {
  const { sprintHit, distance, cooldown, enemyReadyIn, trade = false } = ctx

  if (!s.predictKnockback) {
    return { wtap: sprintHit ? 1 + Math.floor(rng() * 3) : 0, stap: 0, reason: 'W-tap al azar' }
  }

  const kb = blend(model.kbFactor ?? 1, 1, s.modelWeight)
  const jumpReset = model.jumpResetRate !== null && model.jumpResetRate >= 0.5 && s.modelWeight >= 0.5
  const predicted = distance + knockbackDisplacement({ sprintHit, ticks: cooldown, kbFactor: kb, jumpReset })
  const need = predicted - s.hitDistance

  let wtap
  let stap
  let reason
  if (need < -0.3) {
    stap = clamp(Math.ceil(-need / PHYS.WALK_SPEED), 2, 6)
    wtap = sprintHit ? 1 : 0
    reason = 'S-tap: quedaste demasiado cerca'
  } else {
    wtap = clamp(cooldown - ticksToCover(need, { sprint: true }) - 1, sprintHit ? 1 : 0, 8)
    stap = 0
    reason = wtap === 0
      ? `Sin w-tap: te vas a ${fmt(predicted, 1)}`
      : `W-tap de ${wtap} ${wtap === 1 ? 'tick' : 'ticks'}: te vas a ${fmt(predicted, 1)}`
  }

  // Their sword gets charged before ours: back off so we do not trade hits (unless trading is the plan).
  if (
    !trade &&
    enemyReadyIn !== null &&
    enemyReadyIn < cooldown - 2 &&
    distance < enemyReachOf(model) + 0.2
  ) {
    stap = Math.max(stap, 2)
    reason += ' · s-tap para no cambiar golpes'
  }
  return { wtap, stap, reason }
}

// Strafe plan: dodge when the rival sword is about to be ready, otherwise keep the current
// direction until it expires and then pick a new one (favouring the rival weak aim side).
function planStrafe(ctx, model, s, rng, current) {
  const cur = current || { dir: null, until: 0, dodgedAt: -100 }

  if (
    cur.dir &&
    ctx.enemyReadyIn !== null &&
    ctx.enemyReadyIn <= 2 &&
    ctx.tick - (cur.dodgedAt ?? -100) > 10 &&
    rng() < s.dodgeOnReady
  ) {
    return {
      dir: cur.dir === 'left' ? 'right' : 'left',
      until: ctx.tick + 8 + Math.floor(rng() * 7),
      dodgedAt: ctx.tick,
      reason: 'Esquiva: tu espada está cargada'
    }
  }

  if (ctx.tick < cur.until) return { ...cur, reason: cur.reason || (cur.dir ? 'Strafe' : 'Me quedo quieto') }

  let dir
  let reason
  if (model.weakSide && model.confidence.weakSide >= 0.5 && rng() < s.modelWeight) {
    dir = model.weakSide
    // dir is the bot's own strafe key; facing each other, the bot's left is the rival's right
    reason = dir === 'left'
      ? 'Strafe a la izquierda: apuntas peor cuando me muevo a tu derecha'
      : 'Strafe a la derecha: apuntas peor cuando me muevo a tu izquierda'
  } else if (rng() < 0.08) {
    dir = null
    reason = 'Me quedo quieto'
  } else {
    dir = rng() < 0.5 ? 'left' : 'right'
    reason = 'Strafe'
  }
  return {
    dir,
    until: ctx.tick + 8 + Math.floor(rng() * 18),
    dodgedAt: cur.dodgedAt ?? -100,
    reason
  }
}

// Raises the shield only when the rival hit is about to land and ours is not ready.
function planShield(ctx, model, s) {
  const active =
    Boolean(ctx.hasShield && ctx.shieldAllowed) &&
    ctx.enemyReadyIn !== null &&
    ctx.enemyReadyIn <= 1 &&
    ctx.distance <= enemyReachOf(model) + 0.3 &&
    ctx.untilReady > 2
  return { active, reason: active ? 'Escudo: viene tu golpe' : '' }
}

// Breaks the rival combo once we have taken two hits in a row.
function comboBreak(ctx) {
  const active = ctx.comboAgainst >= 2
  return { active, reason: active ? `Rompo tu combo (${ctx.comboAgainst} seguidos)` : '' }
}

module.exports = {
  enemyReachOf,
  chooseHitStyle,
  planCrit,
  planTrade,
  planSpacing,
  planAfterHit,
  planStrafe,
  planShield,
  comboBreak
}
