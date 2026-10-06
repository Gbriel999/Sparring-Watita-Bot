import type { AttackKind, Level, Mode } from './types'

const MATERIAL: Record<string, string> = {
  netherite: 'de netherita',
  diamond: 'de diamante',
  iron: 'de hierro',
  golden: 'de oro',
  stone: 'de piedra',
  wooden: 'de madera',
  chainmail: 'de malla',
  leather: 'de cuero',
  copper: 'de cobre'
}

const PIECE: Record<string, string> = {
  sword: 'Espada',
  axe: 'Hacha',
  helmet: 'Casco',
  chestplate: 'Peto',
  leggings: 'Grebas',
  boots: 'Botas'
}

const SPECIAL: Record<string, string> = {
  shield: 'Escudo',
  totem_of_undying: 'Tótem de la inmortalidad',
  golden_apple: 'Manzana dorada',
  enchanted_golden_apple: 'Manzana encantada',
  turtle_helmet: 'Caparazón de tortuga',
  mace: 'Maza',
  trident: 'Tridente',
  bow: 'Arco',
  crossbow: 'Ballesta',
  arrow: 'Flecha',
  ender_pearl: 'Perla de ender',
  cobweb: 'Telaraña',
  water_bucket: 'Cubo de agua',
  lava_bucket: 'Cubo de lava',
  compass: 'Brújula',
  clock: 'Reloj',
  book: 'Libro',
  chest: 'Cofre',
  ender_chest: 'Cofre de ender',
  nether_star: 'Estrella del Nether',
  player_head: 'Cabeza de jugador',
  experience_bottle: 'Botella de experiencia',
  potion: 'Poción',
  splash_potion: 'Poción arrojadiza'
}

/** Minecraft item id to its Spanish name ("diamond_sword" → "Espada de diamante"). */
export function itemLabel (name: string | null): string {
  if (!name) return '—'
  if (SPECIAL[name]) return SPECIAL[name]
  const match = name.match(/^([a-z]+)_([a-z]+)$/)
  if (match && MATERIAL[match[1]] && PIECE[match[2]]) return `${PIECE[match[2]]} ${MATERIAL[match[1]]}`
  const words = name.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export const MODE_LABEL: Record<Mode, string> = { quieto: 'Quieto', muevete: 'Moverse', pelea: 'Pelear' }

export const MODE_HINT: Record<Mode, string> = {
  quieto: 'Se queda parado, sin moverse ni pegar.',
  muevete: 'Se mueve a tu alrededor sin pegar: para grabar movimiento.',
  pelea: 'Pelea contra ti con PvP de espada moderno.'
}

export const LEVEL_LABEL: Record<Level, string> = { facil: 'Fácil', normal: 'Normal', dificil: 'Difícil', experto: 'Experto' }

export const LEVEL_HINT: Record<Level, string> = {
  facil: 'Reacciona tarde (220–320 ms), falla más y casi no bloquea.',
  normal: 'Como un jugador medio: reacción 150–240 ms, w-tap y críticos a menudo.',
  dificil: 'Reacciona en 110–170 ms, critica casi siempre y se cubre con el escudo.',
  experto: 'Aprende de ti: calcula críticos, w-tap y distancia con tu alcance y tu KB.'
}

export const ATTACK_LABEL: Record<AttackKind, string> = {
  crit: 'Crítico',
  sprint: 'Sprint',
  hit: 'Golpe',
  air: 'Al aire'
}

export type Direction = 'up' | 'down' | 'left' | 'right' | 'up-left' | 'up-right' | 'down-left' | 'down-right' | 'neutral'

/** Movement keys as a fighting-game direction (W is forward, toward the rival). */
export function direction (keys: string[]): Direction {
  const x = (keys.includes('right') ? 1 : 0) - (keys.includes('left') ? 1 : 0)
  const y = (keys.includes('forward') ? 1 : 0) - (keys.includes('back') ? 1 : 0)
  const vertical = y > 0 ? 'up' : y < 0 ? 'down' : ''
  const horizontal = x > 0 ? 'right' : x < 0 ? 'left' : ''
  if (vertical && horizontal) return `${vertical}-${horizontal}` as Direction
  return (vertical || horizontal || 'neutral') as Direction
}

export const DIRECTION_LABEL: Record<Direction, string> = {
  up: 'adelante',
  down: 'atrás',
  left: 'izquierda',
  right: 'derecha',
  'up-left': 'adelante e izquierda',
  'up-right': 'adelante y derecha',
  'down-left': 'atrás e izquierda',
  'down-right': 'atrás y derecha',
  neutral: 'quieto'
}

export const KEY_TAG: Record<string, string> = {
  jump: 'Salto',
  sprint: 'Sprint',
  sneak: 'Agachar',
  shield: 'Escudo'
}

export const STATUS_LABEL: Record<string, string> = {
  conectado: 'Conectado',
  conectando: 'Conectando',
  esperando: 'Reconectando',
  desconectado: 'Desconectado'
}

/** "3,2" with a Spanish decimal comma. */
export function decimal (value: number, digits = 1): string {
  return value.toFixed(digits).replace('.', ',')
}
