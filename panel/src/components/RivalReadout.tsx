import type { InputLinkStatus, RivalReadout as Readout, RivalSummary } from '../types'
import { decimal } from '../names'

const CONFIDENCE_SEGMENTS = 5
/** |orbit| under this is no preference: the rival circles both ways about equally */
const ORBIT_NO_PREFERENCE = 0.2
const AGGRESSION_HIGH = 0.6
const AGGRESSION_LOW = 0.35
/** Same threshold as brain/tactics.js RUNS_AFTER_HIT */
const RUNS_AFTER_HIT = 0.25

interface Row {
  id: string
  label: string
  /** null while the bot has too few samples to say */
  value: string | null
  /** 0..1, or null for a trait with no confidence of its own */
  confidence: number | null
  /** Learned from the owner's own keys (the mod), not estimated from the server */
  fromKeys?: boolean
  /** Only the mod can measure it: hidden while there is neither a link nor a value */
  keysOnly?: boolean
}

function percent (rate: number): string {
  return `${Math.round(rate * 100)} %`
}

function strafeText (summary: RivalSummary): string | null {
  if (summary.orbit === null) return null
  const direction = Math.abs(summary.orbit) < ORBIT_NO_PREFERENCE
    ? 'sin preferencia'
    : summary.orbit > 0 ? 'antihorario' : 'horario'
  return summary.strafeLength === null ? direction : `${direction} · tramos de ${Math.round(summary.strafeLength)} ticks`
}

function aggressionText (aggression: number): string {
  if (aggression > AGGRESSION_HIGH) return 'alta'
  if (aggression < AGGRESSION_LOW) return 'baja'
  return 'media'
}

function ticks (n: number): string {
  const rounded = Math.round(n)
  return `${rounded} ${rounded === 1 ? 'tick' : 'ticks'}`
}

function rowsOf (summary: RivalSummary | null): Row[] {
  const s = summary
  const c = s?.confidence
  const i = s?.inputs
  return [
    {
      id: 'reach',
      label: 'Alcance',
      value: s?.reach ? `${decimal(s.reach.median)} bl · máx ${decimal(s.reach.p90)}` : null,
      confidence: c?.reach ?? 0
    },
    {
      id: 'rhythm',
      label: 'Ritmo',
      value: s && s.swingInterval !== null
        ? `${Math.round(s.swingInterval)} ticks` + (s.spamRate !== null ? ` · spam ${percent(s.spamRate)}` : '')
        : null,
      confidence: c?.rhythm ?? 0,
      fromKeys: s?.sources?.spamRate === 'inputs' || s?.sources?.swingInterval === 'inputs'
    },
    {
      id: 'jump-reset',
      label: 'Jump reset',
      value: s && s.jumpResetRate !== null
        ? percent(s.jumpResetRate) + (s.sources?.jumpResetRate === 'inputs' && i?.jumpResetTicks != null
          ? ` · a ${ticks(i.jumpResetTicks)}`
          : '')
        : null,
      confidence: c?.jumpReset ?? 0,
      fromKeys: s?.sources?.jumpResetRate === 'inputs'
    },
    {
      id: 'kb',
      label: 'KB que recibe',
      value: s && s.kbFactor !== null ? `×${decimal(s.kbFactor, 2)}` : null,
      confidence: c?.kb ?? 0
    },
    {
      id: 'strafe',
      label: 'Strafe',
      value: s ? strafeText(s) : null,
      confidence: c?.strafe ?? 0,
      fromKeys: s?.sources?.strafeLength === 'inputs'
    },
    {
      id: 'weak-side',
      label: 'Lado débil',
      // weakSide is the bot's own strafe key; facing each other, the bot's left is the owner's right
      value: s?.weakSide
        ? (s.weakSide === 'left' ? 'cuando me muevo a tu derecha' : 'cuando me muevo a tu izquierda')
        : (s && s.weakSide === null && (c?.weakSide ?? 0) >= 1 ? 'Ninguno: apuntas igual a los dos lados' : null),
      confidence: c?.weakSide ?? 0
    },
    {
      id: 'crit',
      label: 'Críticos',
      value: s && s.critRate !== null ? percent(s.critRate) : null,
      confidence: c?.crit ?? 0
    },
    {
      id: 'block',
      label: 'Escudo',
      value: s && s.blockRate !== null ? percent(s.blockRate) : null,
      confidence: c?.block ?? 0
    },
    {
      id: 'hit-and-run',
      label: 'Tras pegar',
      value: s && s.hitAndRun != null
        ? (s.hitAndRun > RUNS_AFTER_HIT ? `te vas (${decimal(s.hitAndRun)} bl)` : 'te quedas')
        : null,
      confidence: c?.run ?? 0
    },
    {
      id: 'charge',
      label: 'Carga al pegar',
      value: i?.hitCharge != null ? percent(i.hitCharge) : null,
      confidence: i?.confidence.hitCharge ?? 0,
      fromKeys: true,
      keysOnly: true
    },
    {
      id: 'wtap',
      label: 'W-tap',
      value: i?.wtapRate != null
        ? percent(i.wtapRate) + (i.wtapTicks != null ? ` · suelta ${ticks(i.wtapTicks)}` : '')
        : null,
      confidence: i?.confidence.wtapRate ?? 0,
      fromKeys: true,
      keysOnly: true
    },
    {
      id: 'stap',
      label: 'S-tap',
      value: i?.stapRate != null ? percent(i.stapRate) : null,
      confidence: i?.confidence.stapRate ?? 0,
      fromKeys: true,
      keysOnly: true
    },
    {
      id: 'aggression',
      label: 'Agresividad',
      value: s && s.aggression !== null ? aggressionText(s.aggression) : null,
      confidence: null
    }
  ]
}

function linkText (link: InputLinkStatus | null): string {
  if (!link) return ''
  switch (link.state) {
    case 'conectado': return `Tus teclas: conectado${link.player ? ` (${link.player})` : ''}`
    case 'esperando': return 'Tus teclas: esperando el mod'
    case 'rechazado': return `Tus teclas: rechazado${link.reason ? ` (${link.reason})` : ''}`
    case 'error': return `Tus teclas: sin puerto${link.reason ? ` (${link.reason})` : ''}`
    default: return 'Tus teclas: apagado'
  }
}

function metaText (rival: Readout | null): string {
  if (!rival || rival.summary.samples === 0) return 'aprendiendo…'
  const fights = `${rival.fights} ${rival.fights === 1 ? 'pelea' : 'peleas'}`
  return rival.name ? `${rival.name} · ${fights}` : fights
}

function ConfidenceBar ({ value }: { value: number }) {
  const lit = Math.max(0, Math.min(CONFIDENCE_SEGMENTS, Math.round(value * CONFIDENCE_SEGMENTS)))
  return (
    <span className="rival-conf" role="img" aria-label={`confianza ${lit} de ${CONFIDENCE_SEGMENTS}`}>
      {Array.from({ length: CONFIDENCE_SEGMENTS }, (_, i) => (
        <span key={i} aria-hidden className={i < lit ? 'is-lit' : ''} />
      ))}
    </span>
  )
}

export function RivalReadout ({ rival, link }: { rival: Readout | null, link: InputLinkStatus | null }) {
  const linked = link?.state === 'conectado'
  const rows = rowsOf(rival?.summary ?? null).filter((row) => !row.keysOnly || linked || row.value !== null)
  const plan = rival?.plan ?? []

  return (
    <section className="block rival" aria-labelledby="rival-title">
      <header className="block-head">
        <h2 id="rival-title" className="tab">Lectura del rival</h2>
        <span className="block-meta">{metaText(rival)}</span>
      </header>
      {link && (
        <p className={`rival-link is-${link.state}`} role="status">
          <span className="rival-link-dot" aria-hidden />
          {linkText(link)}
        </p>
      )}

      <div className="rival-body">
        <dl className="rival-list">
          {rows.map((row) => (
            <div key={row.id} className={'rival-row' + (row.value === null ? ' is-empty' : '')}>
              <dt>{row.label}</dt>
              <dd>
                <span className="rival-value">
                  {row.value ?? 'Aprendiendo…'}
                  {row.fromKeys && row.value !== null && <span className="rival-keys">tus teclas</span>}
                </span>
                {row.confidence !== null && <ConfidenceBar value={row.confidence} />}
              </dd>
            </div>
          ))}
        </dl>

        <div className="rival-plan">
          <h3 id="rival-plan-title" className="rival-plan-title">Plan del bot</h3>
          {plan.length > 0
            ? <ol aria-labelledby="rival-plan-title">{plan.map((line, i) => <li key={i}>{line}</li>)}</ol>
            : <p className="rival-plan-empty">Esperando la pelea…</p>}
        </div>
      </div>
    </section>
  )
}
