import type { BotState } from '../types'
import { itemLabel } from '../names'

export function Equipment ({ state }: { state: BotState }) {
  const e = state.equipment
  const slots: Array<{ label: string, item: string | null }> = [
    { label: 'Mano', item: e?.main ?? null },
    { label: 'Mano izq.', item: e?.off ?? null },
    { label: 'Cabeza', item: e?.head ?? null },
    { label: 'Pecho', item: e?.torso ?? null },
    { label: 'Piernas', item: e?.legs ?? null },
    { label: 'Pies', item: e?.feet ?? null }
  ]

  return (
    <section className="block gear" aria-labelledby="gear-title">
      <header className="block-head">
        <h2 id="gear-title" className="tab">Equipo</h2>
        <span className="block-meta">{state.eating ? 'Comiendo…' : e ? 'Se re-equipa cada 3 s' : 'Sin conexión'}</span>
      </header>
      <dl className="gear-list">
        {slots.map((slot) => (
          <div key={slot.label} className={'gear-row' + (slot.item ? '' : ' is-empty')}>
            <dt>{slot.label}</dt>
            <dd>{itemLabel(slot.item)}</dd>
          </div>
        ))}
      </dl>
      <div className="gear-stock">
        <span className="stock">
          <span className="stock-value">{e ? e.totems : '—'}</span>
          <span className="stock-label">Tótems</span>
        </span>
        <span className="stock">
          <span className="stock-value">{e ? e.gapples : '—'}</span>
          <span className="stock-label">Manzanas</span>
        </span>
      </div>
    </section>
  )
}
