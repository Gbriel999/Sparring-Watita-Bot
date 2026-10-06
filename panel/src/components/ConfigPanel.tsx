import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { RefreshCw, Save } from 'lucide-react'
import { api, ApiError } from '../api'
import type { PanelConfig } from '../types'

interface Props {
  token: string
  onNotice: (text: string) => void
  onReconnect: () => void
}

interface Form {
  host: string
  port: string
  version: string
  auth: 'offline' | 'microsoft'
  cuenta: string
  dueno: string
  clave: string
  comandoKit: string
  comandosAlEntrar: string
  avisosPorMensaje: boolean
  reconectar: boolean
}

function toForm (config: PanelConfig): Form {
  return {
    host: config.host || '',
    port: String(config.port || 25565),
    version: config.version || '',
    auth: config.auth === 'microsoft' ? 'microsoft' : 'offline',
    cuenta: config.cuenta || '',
    dueno: config.dueno || '',
    clave: '',
    comandoKit: config.comandoKit || '',
    comandosAlEntrar: (config.comandosAlEntrar || []).join('\n'),
    avisosPorMensaje: Boolean(config.avisosPorMensaje),
    reconectar: config.reconectar !== false
  }
}

function Field ({ id, label, hint, children }: { id: string, label: string, hint?: string, children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <p className="field-hint" id={`${id}-hint`}>{hint}</p>}
    </div>
  )
}

function Switch ({ id, label, hint, checked, onChange }: { id: string, label: string, hint: string, checked: boolean, onChange: (value: boolean) => void }) {
  return (
    <div className="switch-row">
      <div>
        <label htmlFor={id} className="switch-label">{label}</label>
        <p className="field-hint">{hint}</p>
      </div>
      <button id={id} type="button" role="switch" aria-checked={checked} className="switch" onClick={() => onChange(!checked)}>
        <span>{checked ? 'Sí' : 'No'}</span>
      </button>
    </div>
  )
}

export function ConfigPanel ({ token, onNotice, onReconnect }: Props) {
  const [saved, setSaved] = useState<PanelConfig | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [needsReconnect, setNeedsReconnect] = useState(false)

  useEffect(() => {
    api<PanelConfig>(token, '/api/config')
      .then((config) => {
        setSaved(config)
        setForm(toForm(config))
      })
      .catch((e: ApiError) => setError(e.message))
  }, [token])

  if (!form || !saved) {
    return (
      <section className="block config" aria-labelledby="config-title">
        <header className="block-head"><h2 id="config-title" className="tab">Configuración</h2></header>
        <p className="config-loading">{error || 'Cargando…'}</p>
      </section>
    )
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm({ ...form, [key]: value })

  async function submit (event: FormEvent) {
    event.preventDefault()
    if (!form) return
    setSaving(true)
    setError('')
    try {
      const result = await api<{ ok: boolean, error?: string, restart?: boolean, config?: PanelConfig }>(token, '/api/config', {
        method: 'PUT',
        body: JSON.stringify({
          host: form.host,
          port: Number(form.port),
          version: form.version,
          auth: form.auth,
          cuenta: form.cuenta,
          dueno: form.dueno,
          clave: form.clave,
          comandoKit: form.comandoKit,
          comandosAlEntrar: form.comandosAlEntrar.split('\n'),
          avisosPorMensaje: form.avisosPorMensaje,
          reconectar: form.reconectar
        })
      })
      if (!result.ok || !result.config) {
        setError(result.error || 'No se pudo guardar.')
        return
      }
      setSaved(result.config)
      setForm(toForm(result.config))
      setNeedsReconnect(Boolean(result.restart))
      onNotice('Configuración guardada.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="block config" aria-labelledby="config-title">
      <header className="block-head">
        <h2 id="config-title" className="tab">Configuración</h2>
        <span className="block-meta">Se guarda en config.json</span>
      </header>

      <form className="config-form" onSubmit={submit} noValidate>
        <fieldset>
          <legend>Conexión</legend>
          <div className="field-grid">
            <Field id="host" label="Servidor">
              <input id="host" value={form.host} onChange={(e) => set('host', e.target.value)} autoComplete="off" spellCheck={false} />
            </Field>
            <Field id="port" label="Puerto">
              <input id="port" inputMode="numeric" value={form.port} onChange={(e) => set('port', e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Field id="version" label="Versión">
              <input id="version" value={form.version} onChange={(e) => set('version', e.target.value)} placeholder="1.21.11" spellCheck={false} />
            </Field>
            <Field id="auth" label="Tipo de cuenta">
              <select id="auth" value={form.auth} onChange={(e) => set('auth', e.target.value as Form['auth'])}>
                <option value="offline">No premium</option>
                <option value="microsoft">Premium (Microsoft)</option>
              </select>
            </Field>
          </div>
        </fieldset>

        <fieldset>
          <legend>Cuentas</legend>
          <div className="field-grid">
            <Field id="cuenta" label="Cuenta del bot">
              <input id="cuenta" value={form.cuenta} onChange={(e) => set('cuenta', e.target.value)} autoComplete="off" spellCheck={false} />
            </Field>
            <Field id="dueno" label="Tu nombre en Minecraft" hint="El bot solo obedece y pelea contra este jugador.">
              <input id="dueno" value={form.dueno} onChange={(e) => set('dueno', e.target.value)} autoComplete="off" spellCheck={false} aria-describedby="dueno-hint" />
            </Field>
            <Field
              id="clave"
              label="Clave del bot (login)"
              hint={saved.claveGuardada ? 'Hay una clave guardada. Nunca se muestra; escribe otra solo para cambiarla.' : 'Sin clave: si el servidor pide /login, el bot se desconecta.'}
            >
              <input
                id="clave"
                type="password"
                value={form.clave}
                onChange={(e) => set('clave', e.target.value)}
                placeholder={saved.claveGuardada ? '•••••••• guardada' : 'Sin clave'}
                autoComplete="new-password"
                aria-describedby="clave-hint"
              />
            </Field>
          </div>
        </fieldset>

        <fieldset>
          <legend>Al entrar</legend>
          <div className="field-grid">
            <Field id="kit" label="Comando de kit" hint="Lo usa el botón «Pedir kit», ej. /kit pvp.">
              <input id="kit" value={form.comandoKit} onChange={(e) => set('comandoKit', e.target.value)} placeholder="/kit pvp" spellCheck={false} aria-describedby="kit-hint" />
            </Field>
            <Field id="join" label="Comandos al entrar" hint="Uno por línea; se escriben al conectar.">
              <textarea id="join" rows={3} value={form.comandosAlEntrar} onChange={(e) => set('comandosAlEntrar', e.target.value)} spellCheck={false} aria-describedby="join-hint" />
            </Field>
          </div>
          <Switch id="avisos" label="Avisos por mensaje privado" hint="Además del registro, te responde con /msg en el juego."
            checked={form.avisosPorMensaje} onChange={(value) => set('avisosPorMensaje', value)} />
          <Switch id="reconectar" label="Reconectar solo" hint="Si lo expulsan o se cae, vuelve a entrar a los 10 s."
            checked={form.reconectar} onChange={(value) => set('reconectar', value)} />
        </fieldset>

        {error && <p className="form-error" role="alert">{error}</p>}
        {needsReconnect && (
          <div className="form-restart" role="status">
            <span>La conexión cambió: se aplica al reconectar.</span>
            <button type="button" className="action" onClick={() => { setNeedsReconnect(false); onReconnect() }}>
              <RefreshCw aria-hidden size={16} strokeWidth={2.25} /> Reconectar ahora
            </button>
          </div>
        )}
        <div className="form-actions">
          <button type="submit" className="action action-primary" disabled={saving}>
            <Save aria-hidden size={16} strokeWidth={2.25} /> {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </section>
  )
}
