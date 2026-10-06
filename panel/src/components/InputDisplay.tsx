import {
  ArrowDown, ArrowDownLeft, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUp, ArrowUpLeft, ArrowUpRight, Dot,
  type LucideIcon
} from 'lucide-react'
import type { BotState } from '../types'
import { ATTACK_LABEL, DIRECTION_LABEL, KEY_TAG, direction, type Direction } from '../names'

const ARROW: Record<Direction, LucideIcon> = {
  up: ArrowUp,
  down: ArrowDown,
  left: ArrowLeft,
  right: ArrowRight,
  'up-left': ArrowUpLeft,
  'up-right': ArrowUpRight,
  'down-left': ArrowDownLeft,
  'down-right': ArrowDownRight,
  neutral: Dot
}

function Arrow ({ keys }: { keys: string[] }) {
  const dir = direction(keys)
  const Icon = ARROW[dir]
  return (
    <span className={'input-arrow' + (dir === 'neutral' ? ' is-neutral' : '')}>
      <Icon size={18} strokeWidth={2.5} aria-label={DIRECTION_LABEL[dir]} />
    </span>
  )
}

interface Props {
  state: BotState
}

function Cap ({ on, label, wide, tone }: { on: boolean, label: string, wide?: boolean, tone?: 'hit' }) {
  return (
    <span className={'cap' + (wide ? ' cap-wide' : '') + (on ? ' is-on' : '') + (on && tone ? ` is-${tone}` : '')}>
      {label}
    </span>
  )
}

export function InputDisplay ({ state }: Props) {
  const c = state.controls
  // One update covers two ticks: a swing in either lights the click
  const recent = state.frames.slice(-3)
  const swung = recent.some((frame) => frame.a !== null)
  const live = state.status === 'conectado'

  return (
    <section className="block inputs" aria-labelledby="inputs-title">
      <header className="block-head">
        <h2 id="inputs-title" className="tab">Entradas</h2>
        <span className="block-meta">{live ? 'En vivo · 20 ticks/s' : 'Sin señal'}</span>
      </header>

      <div className="inputs-body">
        <div className="caps" aria-label="Teclas que pulsa el bot ahora">
          <div className="caps-row caps-wasd">
            <span />
            <Cap on={!!c.forward} label="W" />
            <span />
            <Cap on={!!c.left} label="A" />
            <Cap on={!!c.back} label="S" />
            <Cap on={!!c.right} label="D" />
          </div>
          <div className="caps-row caps-mods">
            <Cap on={!!c.jump} label="Salto" wide />
            <Cap on={!!c.sprint} label="Sprint" wide />
            <Cap on={!!c.sneak} label="Agachar" wide />
          </div>
          <div className="caps-row caps-mouse">
            <Cap on={swung} label="Clic izq." wide tone="hit" />
            <Cap on={!!c.shield} label="Escudo" wide />
          </div>
        </div>

        <ol className="input-log" aria-label="Historial de entradas, la más reciente arriba">
          {state.inputs.length === 0 && <li className="input-empty">Sin entradas todavía</li>}
          {state.inputs.map((entry, index) => (
            <li key={entry.id} className={'input-entry' + (index === 0 ? ' is-latest' : '')}>
              <span className="input-frames">{entry.frames > 99 ? '99+' : entry.frames}</span>
              <Arrow keys={entry.keys} />
              <span className="input-tags">
                {entry.keys.filter((k) => KEY_TAG[k]).map((k) => (
                  <span key={k} className="input-tag">{KEY_TAG[k]}</span>
                ))}
                {entry.attack && (
                  <span className={'input-tag input-attack' + (entry.attack === 'air' ? ' is-miss' : '')}>
                    {ATTACK_LABEL[entry.attack]}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
