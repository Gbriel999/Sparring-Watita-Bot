import { useCallback, useEffect, useState } from 'react'
import { api, forgetToken, readToken, rememberToken, useBotStream } from './api'
import { StatusStrip } from './components/StatusStrip'
import { DummyMenu } from './components/DummyMenu'
import { InputDisplay } from './components/InputDisplay'
import { RivalReadout } from './components/RivalReadout'
import { FrameMeter } from './components/FrameMeter'
import { CombatStage } from './components/CombatStage'
import { Equipment } from './components/Equipment'
import { LogPanel } from './components/LogPanel'
import { ConfigPanel } from './components/ConfigPanel'
import { LockScreen } from './components/LockScreen'

const NOTICE_MS = 4200

export default function App () {
  const [token, setToken] = useState<string | null>(readToken)
  const { state, logs, link, lastEvent } = useBotStream(token)
  const [notice, setNotice] = useState<{ text: string, id: number } | null>(null)

  const notify = useCallback((text: string) => setNotice({ text, id: Date.now() }), [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

  const send = useCallback(async (command: string) => {
    if (!token) return false
    try {
      await api(token, '/api/command', { method: 'POST', body: JSON.stringify({ text: command }) })
      return true
    } catch (e) {
      notify((e as Error).message)
      return false
    }
  }, [token, notify])

  const call = useCallback((path: string) => {
    if (!token) return
    api(token, path, { method: 'POST' }).catch((e: Error) => notify(e.message))
  }, [token, notify])

  if (!token || link === 'sin-permiso') {
    return (
      <LockScreen
        rejected={link === 'sin-permiso'}
        onToken={(next) => {
          forgetToken()
          rememberToken(next)
          setToken(next)
        }}
      />
    )
  }

  if (!state) {
    return (
      <main className="booting" aria-busy="true">
        <span className="brand-mark" aria-hidden />
        <p>{link === 'perdido' ? 'No hay conexión con el bot: ¿está abierta su ventana?' : 'Enlazando con el bot…'}</p>
      </main>
    )
  }

  return (
    <div className="app">
      <StatusStrip state={state} link={link} onConnect={() => call('/api/connect')} onDisconnect={() => call('/api/disconnect')} />
      <main className="stage">
        <div className="area-menu"><DummyMenu state={state} send={send} onNotice={notify} /></div>
        <div className="area-combat"><CombatStage state={state} lastEvent={lastEvent} token={token} /></div>
        <div className="area-meter"><FrameMeter state={state} /></div>
        <div className="area-inputs"><InputDisplay state={state} /></div>
        <div className="area-rival"><RivalReadout rival={state.rival} link={state.inputLink ?? null} /></div>
        <div className="area-gear"><Equipment state={state} /></div>
        <div className="area-log"><LogPanel logs={logs} send={send} /></div>
        <div className="area-config"><ConfigPanel token={token} onNotice={notify} onReconnect={() => call('/api/reconnect')} /></div>
      </main>
      <div className="notice-slot" role="status" aria-live="polite">
        {notice && <p key={notice.id} className="notice">{notice.text}</p>}
      </div>
    </div>
  )
}
