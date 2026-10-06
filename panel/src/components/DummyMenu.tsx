import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { PackageOpen, RotateCcw, Shirt } from 'lucide-react'
import type { BotState } from '../types'
import { LEVEL_HINT, MODE_HINT } from '../names'

interface Option {
  value: string
  label: string
  command: string
  needsOwner?: boolean
}

interface Row {
  id: string
  label: string
  value: string
  hint: string
  options: Option[]
}

function onOff (id: string, label: string, on: boolean, command: string, hintOn: string, hintOff: string): Row {
  return {
    id,
    label,
    value: on ? 'si' : 'no',
    hint: on ? hintOn : hintOff,
    options: [
      { value: 'no', label: 'No', command: `${command} off` },
      { value: 'si', label: 'Sí', command: `${command} on` }
    ]
  }
}

/** Why Moverse and Pelear are blocked, in the row itself: a phone has no hover title. */
function actionHint (state: BotState): string {
  if (state.status !== 'conectado' || state.owner.visible) return MODE_HINT[state.mode]
  return state.owner.inServer
    ? 'Moverse y Pelear necesitan verte: acércate a menos de 30 bloques.'
    : `Moverse y Pelear necesitan que estés en su servidor: /send ${state.account} <servidor>.`
}

function rowsOf (state: BotState): Row[] {
  return [
    {
      id: 'accion',
      label: 'Acción',
      value: state.mode,
      hint: actionHint(state),
      options: [
        { value: 'quieto', label: 'Quieto', command: '!para' },
        { value: 'muevete', label: 'Moverse', command: '!muevete', needsOwner: true },
        { value: 'pelea', label: 'Pelear', command: '!pelea', needsOwner: true }
      ]
    },
    {
      id: 'nivel',
      label: 'Nivel',
      value: state.level,
      hint: LEVEL_HINT[state.level],
      options: [
        { value: 'facil', label: 'Fácil', command: '!nivel facil' },
        { value: 'normal', label: 'Normal', command: '!nivel normal' },
        { value: 'dificil', label: 'Difícil', command: '!nivel dificil' },
        { value: 'experto', label: 'Experto', command: '!nivel experto' }
      ]
    },
    onOff('escudo', 'Escudo', state.toggles.shield, '!escudo',
      'Lo levanta entre golpes; si no hay tótem, lo lleva en la mano izquierda.', 'Nunca bloquea.'),
    onOff('totem', 'Tótems', state.toggles.totem, '!totem',
      'Siempre uno en la mano izquierda; repone el siguiente al gastarlo.', 'No se equipa tótems.'),
    onOff('manzanas', 'Manzanas', state.toggles.gapple, '!gapple',
      'Come una manzana dorada con 5 corazones o menos.', 'No come aunque tenga poca vida.')
  ]
}

interface Props {
  state: BotState
  send: (command: string) => Promise<boolean>
  onNotice: (text: string) => void
}

const PENDING_TIMEOUT_MS = 4000

export function DummyMenu ({ state, send, onNotice }: Props) {
  const rows = rowsOf(state)
  const online = state.status === 'conectado'
  const [pending, setPending] = useState<Record<string, string>>({})
  // The row last changed keeps the menu cursor on touch screens (no hover there)
  const [current, setCurrent] = useState<string | null>(null)
  const groupRefs = useRef<Array<HTMLDivElement | null>>([])

  // A pending choice is done once the bot reports it
  useEffect(() => {
    setPending((current) => {
      const next = { ...current }
      let changed = false
      for (const row of rows) {
        if (next[row.id] !== undefined && next[row.id] === row.value) {
          delete next[row.id]
          changed = true
        }
      }
      return changed ? next : current
    })
  })

  // The cursor stays a moment after the bot confirms the change
  const currentPending = current !== null && pending[current] !== undefined
  useEffect(() => {
    if (current === null || currentPending) return
    const timer = window.setTimeout(() => setCurrent(null), 1200)
    return () => window.clearTimeout(timer)
  }, [current, currentPending])

  async function choose (row: Row, option: Option) {
    if (option.value === row.value && pending[row.id] === undefined) return
    if (!online) return onNotice('El bot no está conectado: conéctalo arriba.')
    if (option.needsOwner && !state.owner.visible) {
      return onNotice(state.owner.inServer
        ? `No te ve: acércate a menos de 30 bloques de ${state.account}.`
        : `No estás en su servidor. Usa /send ${state.account} <servidor> o entra a su modalidad.`)
    }
    setCurrent(row.id)
    setPending((current) => ({ ...current, [row.id]: option.value }))
    const sent = await send(option.command)
    window.setTimeout(() => {
      setPending((current) => {
        if (current[row.id] !== option.value) return current
        const next = { ...current }
        delete next[row.id]
        if (sent) onNotice('El bot no cambió el ajuste: mira el registro para saber por qué.')
        return next
      })
    }, PENDING_TIMEOUT_MS)
  }

  // Fighting-game menu: up/down picks the setting, left/right changes its value
  function onKey (event: KeyboardEvent, rowIndex: number) {
    const row = rows[rowIndex]
    const current = row.options.findIndex((o) => o.value === (pending[row.id] ?? row.value))
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const step = event.key === 'ArrowLeft' ? -1 : 1
      const next = (current + step + row.options.length) % row.options.length
      choose(row, row.options[next])
      focusOption(rowIndex, next)
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      const target = (rowIndex + (event.key === 'ArrowUp' ? -1 : 1) + rows.length) % rows.length
      const checked = groupRefs.current[target]?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
      checked?.focus()
    }
  }

  function focusOption (rowIndex: number, optionIndex: number) {
    const buttons = groupRefs.current[rowIndex]?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    buttons?.[optionIndex]?.focus()
  }

  return (
    <section className="block dummy" aria-labelledby="dummy-title">
      <header className="block-head">
        <h2 id="dummy-title" className="tab">Ajustes del muñeco</h2>
        {online
          ? <span className="block-meta keyboard-only">Flechas del teclado: ajuste y valor</span>
          : <span className="block-meta">Sin conexión</span>}
      </header>

      <div className="menu" aria-disabled={!online}>
        {rows.map((row, rowIndex) => {
          const shown = pending[row.id] ?? row.value
          return (
            <div className={'menu-row' + (current === row.id ? ' is-current' : '')} key={row.id}>
              <div className="menu-label">
                <span className="menu-name" id={`row-${row.id}`}>{row.label}</span>
                <span className="menu-hint">{row.hint}</span>
              </div>
              <div
                className="menu-options"
                role="radiogroup"
                aria-labelledby={`row-${row.id}`}
                ref={(element) => { groupRefs.current[rowIndex] = element }}
              >
                {row.options.map((option) => {
                  const checked = shown === option.value
                  const isPending = pending[row.id] === option.value
                  const blocked = option.needsOwner && !state.owner.visible
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      tabIndex={checked ? 0 : -1}
                      className={'menu-option' + (isPending ? ' is-pending' : '') + (blocked ? ' is-blocked' : '')}
                      onClick={() => choose(row, option)}
                      onKeyDown={(event) => onKey(event, rowIndex)}
                    >
                      <span>{option.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div className="menu-actions">
        <button type="button" className="action" disabled={!online} onClick={() => send('!equipar')}>
          <Shirt aria-hidden size={16} strokeWidth={2.25} /> Equipar lo mejor
        </button>
        <button type="button" className="action" disabled={!online} onClick={() => send('!kit')}>
          <PackageOpen aria-hidden size={16} strokeWidth={2.25} /> Pedir kit
        </button>
        <button type="button" className="action" onClick={() => send('!reiniciar')}>
          <RotateCcw aria-hidden size={16} strokeWidth={2.25} /> Contadores a cero
        </button>
      </div>
    </section>
  )
}
