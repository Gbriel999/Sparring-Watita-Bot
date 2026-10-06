export type Status = 'conectando' | 'conectado' | 'esperando' | 'desconectado'
export type Mode = 'quieto' | 'muevete' | 'pelea'
export type Level = 'facil' | 'normal' | 'dificil' | 'experto'
export type AttackKind = 'crit' | 'sprint' | 'hit' | 'air'

export interface InputEntry {
  id: number
  keys: string[]
  attack: AttackKind | null
  frames: number
}

/** One physics tick: attack charge 0..1, the swing on that tick, knockback received. */
export interface Frame {
  c: number
  a: AttackKind | null
  k: boolean
}

export interface Equipment {
  head: string | null
  torso: string | null
  legs: string | null
  feet: string | null
  main: string | null
  off: string | null
  totems: number
  gapples: number
}

/** The bot's combat record, counted from damage the server confirmed. */
export interface Session {
  since: number
  landed: number
  missed: number
  received: number
  damageTaken: number
  accuracy: number | null
  crits: number
  sprintHits: number
  combo: number
  comboMax: number
  totems: number
  deaths: number
  knockbacks: number
  lastKnockback: number
}

export interface Body {
  onGround: boolean
  pitch: number
  hurtAt: number
}

export interface Skin {
  id: string
  model: 'default' | 'slim'
}

/** What the bot has learned about its rival (rates are 0..1, distances in blocks, intervals in ticks). */
export interface RivalSummary {
  samples: number
  reach: { median: number, p90: number } | null
  swingInterval: number | null
  spamRate: number | null
  jumpResetRate: number | null
  kbFactor: number | null
  /** -1..1: positive is counter-clockwise around the bot */
  orbit: number | null
  strafeLength: number | null
  weakSide: 'left' | 'right' | null
  critRate: number | null
  blockRate: number | null
  aggression: number | null
  preferredDistance: number | null
  /** Blocks the rival backs off by itself right after its swing (hit and run) */
  hitAndRun: number | null
  confidence: {
    reach: number
    rhythm: number
    jumpReset: number
    kb: number
    strafe: number
    weakSide: number
    crit: number
    block: number
    run: number
  }
  /** Where each replaceable trait came from: the owner's own keys (the mod) or the server estimate */
  sources?: Partial<Record<'spamRate' | 'swingInterval' | 'jumpResetRate' | 'strafeLength', 'inputs' | 'servidor'>>
  /** What the owner's keys say (brain/inputs.js); rates 0..1, ticks, blocks */
  inputs?: InputHabits
}

export interface InputHabits {
  samples: number
  spamRate: number | null
  swingInterval: number | null
  hitCharge: number | null
  critAttemptRate: number | null
  hitDistance: number | null
  wtapRate: number | null
  wtapTicks: number | null
  stapRate: number | null
  jumpResetRate: number | null
  jumpResetTicks: number | null
  strafeLength: number | null
  confidence: Record<'spamRate' | 'swingInterval' | 'hitCharge' | 'critAttemptRate' | 'hitDistance' | 'wtapRate'
    | 'wtapTicks' | 'stapRate' | 'jumpResetRate' | 'jumpResetTicks' | 'strafeLength', number>
}

/** The link with the Watita Sparring Link mod (input-link.js) */
export interface InputLinkStatus {
  state: 'esperando' | 'conectado' | 'rechazado' | 'apagado' | 'error'
  player?: string
  reason?: string
  badLines?: number
}

export interface RivalReadout {
  /** The owner's name, or '' when none is set (never null) */
  name: string
  fights: number
  summary: RivalSummary
  /** The bot's current plan, one reason per line */
  plan: string[]
}

export interface BotState {
  status: Status
  connectedAt: number
  server: string
  version: string
  account: string
  ownerName: string
  ping: number | null
  ticksPerSecond: number | null
  dimension: string | null
  position: { x: number, y: number, z: number } | null
  owner: { inServer: boolean, visible: boolean, distance: number | null }
  mode: Mode
  level: Level
  toggles: { shield: boolean, totem: boolean, gapple: boolean }
  health: number | null
  food: number | null
  equipment: Equipment | null
  eating: boolean
  controls: Record<string, boolean>
  charge: { value: number, cooldown: number }
  inputs: InputEntry[]
  frames: Frame[]
  session: Session
  body: Body | null
  skin: Skin | null
  /** null while the bot is offline or runs an older backend */
  rival: RivalReadout | null
  inputLink?: InputLinkStatus
}

export interface CombatEvent {
  kind: AttackKind | 'kb' | 'totem' | 'death' | 'landed' | 'hurt'
  strength?: number
  at: number
}

/** config.json as the panel sees it: never the password, only whether one is saved. */
export interface PanelConfig {
  host: string
  port?: number
  cuenta: string
  auth?: 'offline' | 'microsoft'
  version?: string
  dueno: string
  nivel?: Level
  escudo?: boolean
  totem?: boolean
  gapple?: boolean
  avisosPorMensaje?: boolean
  reconectar?: boolean
  comandoKit?: string
  comandosAlEntrar?: string[]
  claveGuardada: boolean
}
