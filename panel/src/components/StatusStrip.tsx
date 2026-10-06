import { useEffect, useRef, useState } from 'react'
import { MapPinOff, Plug, PlugZap, Power } from 'lucide-react'
import type { Link } from '../api'
import type { BotState } from '../types'
import { MODE_LABEL, STATUS_LABEL, decimal } from '../names'

interface Props {
  state: BotState
  link: Link
  onConnect: () => void
  onDisconnect: () => void
}

const MAX_HEALTH = 20

/** Health as ten heart segments; a lost chunk stays red for a moment, like a fighting game bar. */
function HealthBar ({ health }: { health: number | null }) {
  const [trail, setTrail] = useState(health ?? 0)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const value = health ?? 0
    if (value >= trail) {
      setTrail(value)
      return
    }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setTrail(value), 700)
    return () => window.clearTimeout(timer.current)
  }, [health, trail])

  const value = health ?? 0
  return (
    <span className="health" role="meter" aria-valuemin={0} aria-valuemax={MAX_HEALTH} aria-valuenow={value}
      aria-label={`Vida ${decimal(value / 2)} de 10 corazones`}>
      <span className="health-track">
        <span className="health-trail" style={{ transform: `scaleX(${trail / MAX_HEALTH})` }} />
        <span className="health-fill" style={{ transform: `scaleX(${value / MAX_HEALTH})` }} />
      </span>
      <span className="health-ticks" aria-hidden />
    </span>
  )
}

function ownerText (state: BotState): { text: string, tone: string } {
  if (state.status !== 'conectado') return { text: '—', tone: 'dim' }
  if (state.owner.visible && state.owner.distance !== null) return { text: `a ${decimal(state.owner.distance)} bloques`, tone: 'live' }
  if (state.owner.inServer) return { text: 'lejos, no te ve', tone: 'warn' }
  return { text: 'en otro servidor', tone: 'warn' }
}

export function StatusStrip ({ state, link, onConnect, onDisconnect }: Props) {
  const online = state.status === 'conectado'
  const busy = state.status === 'conectando' || state.status === 'esperando'
  const owner = ownerText(state)
  const linkLost = link === 'perdido'

  return (
    <header className="strip">
      <div className="brand">
        <span className="brand-mark" aria-hidden />
        <span className="brand-name">Sparring</span>
        <span className="brand-sub">Modo entrenamiento</span>
      </div>

      <dl className="strip-items">
        <div className="strip-item strip-status">
          <dt>Bot</dt>
          <dd>
            <span className={`status-dot is-${linkLost ? 'lost' : state.status}`} aria-hidden />
            {linkLost ? 'Sin enlace con el bot' : `${STATUS_LABEL[state.status]} · ${state.account}`}
          </dd>
        </div>
        <div className="strip-item">
          <dt>Acción</dt>
          <dd className="strip-mode">{online ? MODE_LABEL[state.mode] : '—'}</dd>
        </div>
        <div className="strip-item">
          <dt>Servidor</dt>
          <dd className="mono-ish">{state.server}</dd>
        </div>
        <div className="strip-item">
          <dt>Ping</dt>
          <dd className="num">{state.ping !== null ? <>{state.ping}<small> ms</small></> : '—'}</dd>
        </div>
        <div className="strip-item">
          <dt>Ticks/s</dt>
          <dd className={'num' + (state.ticksPerSecond !== null && state.ticksPerSecond < 18 ? ' is-warn' : '')}>
            {state.ticksPerSecond ?? '—'}
          </dd>
        </div>
        <div className="strip-item">
          <dt>{state.ownerName}</dt>
          <dd className={`owner is-${owner.tone}`}>
            {owner.tone === 'warn' && <MapPinOff aria-hidden size={14} strokeWidth={2.25} />}
            {owner.text}
          </dd>
        </div>
        <div className="strip-item strip-health">
          <dt>Vida {state.health !== null ? <span className="num">{decimal(state.health / 2)}</span> : null}</dt>
          <dd><HealthBar health={online ? state.health : null} /></dd>
        </div>
      </dl>

      <div className="strip-actions">
        {online || busy
          ? (
            <button type="button" className="action action-quiet" onClick={onDisconnect}>
              <Power aria-hidden size={16} strokeWidth={2.25} /> {busy ? 'Cancelar' : 'Desconectar'}
            </button>
            )
          : (
            <button type="button" className="action action-primary" onClick={onConnect}>
              {state.status === 'desconectado' ? <Plug aria-hidden size={16} strokeWidth={2.25} /> : <PlugZap aria-hidden size={16} />}
              Conectar
            </button>
            )}
      </div>
    </header>
  )
}
