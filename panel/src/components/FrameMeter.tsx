import type { BotState, Frame } from '../types'

const LENGTH = 60

function frameClass (frame: Frame | undefined): string {
  if (!frame) return 'frame is-empty'
  if (frame.k) return 'frame is-hurt'
  if (frame.a === 'air') return 'frame is-miss'
  if (frame.a === 'crit') return 'frame is-crit'
  if (frame.a) return 'frame is-hit'
  if (frame.c >= 1) return 'frame is-ready'
  return 'frame is-charge'
}

export function FrameMeter ({ state }: { state: BotState }) {
  const frames = state.frames
  const padded: Array<Frame | undefined> = Array.from({ length: LENGTH - frames.length }, () => undefined)
  const cells = padded.concat(frames)
  const charge = Math.round(state.charge.value * 100)

  return (
    <section className="block meter" aria-labelledby="meter-title">
      <header className="block-head">
        <h2 id="meter-title" className="tab">Medidor de frames</h2>
        <span className="block-meta">Últimos 3 s</span>
      </header>

      <div className="meter-readout">
        <span className="readout">
          <span className="readout-label">Carga</span>
          <span className={'readout-value' + (charge >= 100 ? ' is-ready' : '')}>{charge}%</span>
        </span>
        <span className="readout">
          <span className="readout-label">Recarga del arma</span>
          <span className="readout-value">{state.charge.cooldown || '—'}<small> ticks</small></span>
        </span>
      </div>

      <div className="frames" role="img" aria-label={`Carga del ataque ${charge}%. Golpes y daño de los últimos 3 segundos.`}>
        {cells.map((frame, index) => (
          <span key={index} className={frameClass(frame)}>
            {frame && !frame.a && !frame.k && frame.c < 1 && (
              <span className="frame-fill" style={{ transform: `scaleY(${Math.max(0.08, frame.c)})` }} />
            )}
          </span>
        ))}
      </div>

      <ul className="legend" aria-label="Leyenda">
        <li><span className="swatch is-charge" />Recargando</li>
        <li><span className="swatch is-ready" />Listo</li>
        <li><span className="swatch is-hit" />Golpe</li>
        <li><span className="swatch is-crit" />Crítico</li>
        <li><span className="swatch is-miss" />Al aire</li>
        <li><span className="swatch is-hurt" />Recibe golpe</li>
        <li className="legend-note">1 casilla = 1 tick (50 ms)</li>
      </ul>
    </section>
  )
}
