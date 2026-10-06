import { useState, type FormEvent } from 'react'
import { KeyRound } from 'lucide-react'
import { tokenFromInput } from '../api'

interface Props {
  rejected: boolean
  onToken: (token: string) => void
}

export function LockScreen ({ rejected, onToken }: Props) {
  const [text, setText] = useState('')

  function submit (event: FormEvent) {
    event.preventDefault()
    const token = tokenFromInput(text)
    if (token) onToken(token)
  }

  return (
    <main className="lock">
      <div className="lock-card">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <span className="brand-name">Sparring</span>
          <span className="brand-sub">Modo entrenamiento</span>
        </div>
        <h1>{rejected ? 'Esa clave del panel no vale' : 'Abre el enlace del bot'}</h1>
        <p>
          La ventana del bot muestra dos enlaces al arrancar: «Panel en este PC» y «Panel en el móvil».
          Ábrelo tal cual o pégalo aquí.
        </p>
        <form onSubmit={submit} className="lock-form">
          <label htmlFor="token">Enlace o clave del panel</label>
          <div className="lock-row">
            <input id="token" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" spellCheck={false}
              placeholder="http://192.168.…:3210/?t=…" />
            <button type="submit" className="action action-primary" disabled={!text.trim()}>
              <KeyRound aria-hidden size={16} strokeWidth={2.25} /> Entrar
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
