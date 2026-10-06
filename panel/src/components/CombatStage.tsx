import { useEffect, useRef, useState } from 'react'
import type { BotState, CombatEvent } from '../types'
import type { Stage } from '../three/stage'
import { idlePose, type Pose } from '../three/liveAnimation'
import { decimal } from '../names'

interface Props {
  state: BotState
  lastEvent: CombatEvent | null
  token: string
}

const SWINGS = new Set(['crit', 'sprint', 'hit', 'air'])
const CALLOUT_MS = 1400
const ACCURACY_SEGMENTS = 20

function elapsed (since: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - since) / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function prefersReducedMotion (): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function CombatStage ({ state, lastEvent, token }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const stage = useRef<Stage | null>(null)
  const pose = useRef<Pose>(idlePose())
  const lastSwingKind = useRef<string | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [skinNote, setSkinNote] = useState('')
  const [callout, setCallout] = useState<{ text: string, tone: string, id: number } | null>(null)
  const online = state.status === 'conectado'

  // The 3D stage loads on demand and pauses while it is off screen
  useEffect(() => {
    const element = wrap.current
    const target = canvas.current
    if (!element || !target) return
    let disposed = false
    let resize: ResizeObserver | null = null
    let visible: IntersectionObserver | null = null
    import('../three/stage')
      .then(({ createStage }) => {
        if (disposed) return
        const created = createStage(target, element.clientWidth, element.clientHeight)
        created.setPose(pose.current)
        stage.current = created
        setReady(true)
        resize = new ResizeObserver(() => created.resize(element.clientWidth, element.clientHeight))
        resize.observe(element)
        visible = new IntersectionObserver(([entry]) => created.setPaused(!entry.isIntersecting))
        visible.observe(element)
      })
      .catch(() => setFailed(true))
    return () => {
      disposed = true
      resize?.disconnect()
      visible?.disconnect()
      stage.current?.dispose()
      stage.current = null
    }
  }, [])

  // The bot's skin from its server, or the training dummy
  const skinId = state.skin?.id ?? null
  const skinModel = state.skin?.model ?? 'default'
  useEffect(() => {
    if (!ready || !stage.current) return
    const url = skinId ? `/api/skin?t=${encodeURIComponent(token)}&v=${skinId}` : null
    stage.current.setSkin(url, skinModel)
      .then(() => setSkinNote(url ? '' : 'Sin skin en el servidor: muñeco de entrenamiento'))
      .catch(() => {
        setSkinNote('No pude cargar su skin: muñeco de entrenamiento')
        stage.current?.setSkin(null, 'default').catch(() => {})
      })
  }, [ready, skinId, skinModel, token])

  useEffect(() => {
    stage.current?.setLive(online)
  }, [online, ready])

  // Live pose from the latest state
  const c = state.controls
  pose.current.forward = !!c.forward
  pose.current.back = !!c.back
  pose.current.left = !!c.left
  pose.current.right = !!c.right
  pose.current.sprint = !!c.sprint
  pose.current.sneak = !!c.sneak
  pose.current.shield = !!c.shield
  pose.current.eating = state.eating
  pose.current.onGround = state.body ? state.body.onGround : true
  pose.current.pitch = state.body ? state.body.pitch : 0
  pose.current.reducedMotion = prefersReducedMotion()

  // Swings and damage, timed on this page's clock (the phone's clock is not the bot's)
  useEffect(() => {
    if (!lastEvent) return
    if (SWINGS.has(lastEvent.kind)) {
      pose.current.swingAt = performance.now()
      lastSwingKind.current = lastEvent.kind
    } else if (lastEvent.kind === 'hurt') {
      pose.current.hurtAt = performance.now()
    }
    let next: { text: string, tone: string } | null = null
    if (lastEvent.kind === 'landed' && lastSwingKind.current === 'crit') next = { text: '¡Crítico!', tone: 'crit' }
    if (lastEvent.kind === 'totem') next = { text: '¡Tótem!', tone: 'totem' }
    if (!next) return
    setCallout({ ...next, id: lastEvent.at })
    const timer = window.setTimeout(() => setCallout(null), CALLOUT_MS)
    return () => window.clearTimeout(timer)
  }, [lastEvent])

  const s = state.session
  const accuracy = s.accuracy === null ? null : Math.round(s.accuracy * 100)
  const lit = accuracy === null ? 0 : Math.round((accuracy / 100) * ACCURACY_SEGMENTS)

  return (
    <section className="block combat" aria-labelledby="combat-title">
      <header className="block-head">
        <h2 id="combat-title" className="tab">Combate</h2>
        <span className="block-meta">Sesión · {elapsed(s.since, Date.now())}</span>
      </header>

      <div className={'arena' + (online ? '' : ' is-offline')}>
        <div className="arena-model" ref={wrap}>
          <canvas
            ref={canvas}
            role="img"
            aria-label={`${state.account} en 3D, imitando lo que hace ahora. Arrastra para girarlo.`}
          />
        </div>
        {failed && <p className="arena-note">Este navegador no puede mostrar 3D.</p>}
        {!failed && !online && <p className="arena-note">Sin conexión</p>}
        <p className="callout-slot" aria-live="polite">
          {callout && <span key={callout.id} className={`callout callout-${callout.tone}`}>{callout.text}</span>}
        </p>
      </div>

      {!failed && online && skinNote && <p className="arena-caption">{skinNote}</p>}

      <dl className="combat-main">
        <div className="big-stat">
          <dt>Dados</dt>
          <dd>{s.landed}</dd>
        </div>
        <div className={'big-stat' + (s.received > 0 ? ' is-damage' : '')}>
          <dt>Recibidos</dt>
          <dd>{s.received}</dd>
        </div>
        <div className="big-stat">
          <dt>Fallados</dt>
          <dd>{s.missed}</dd>
        </div>
        <div className="big-stat big-accuracy">
          <dt>Acierto</dt>
          <dd>{accuracy === null ? '—' : <>{accuracy}<small>%</small></>}</dd>
          <span className="accuracy-bar" aria-hidden>
            {Array.from({ length: ACCURACY_SEGMENTS }, (_, i) => (
              <span key={i} className={i < lit ? 'is-lit' : ''} />
            ))}
          </span>
        </div>
      </dl>

      <dl className="combat-more">
        <div><dt>Críticos</dt><dd>{s.crits}</dd></div>
        <div><dt>Con sprint</dt><dd>{s.sprintHits}</dd></div>
        <div><dt>Combo</dt><dd>{s.combo}<small> · máx {s.comboMax}</small></dd></div>
        <div><dt>Vida perdida</dt><dd>{decimal(s.damageTaken / 2)}<small> corazones</small></dd></div>
        <div><dt>Tótems usados</dt><dd>{s.totems}</dd></div>
        <div><dt>Muertes</dt><dd>{s.deaths}</dd></div>
      </dl>
    </section>
  )
}
