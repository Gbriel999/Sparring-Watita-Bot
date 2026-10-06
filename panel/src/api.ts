import { useEffect, useState } from 'react'
import type { BotState, CombatEvent } from './types'

const TOKEN_KEY = 'sparring.panelToken'

/** The panel token: from the link (?t=...), remembered on this device, then removed from the URL. */
export function readToken (): string | null {
  const url = new URL(window.location.href)
  const fromLink = url.searchParams.get('t')
  if (fromLink) {
    rememberToken(fromLink)
    url.searchParams.delete('t')
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
    return fromLink
  }
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function rememberToken (token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // Private mode: the token lives until the tab closes
  }
}

export function forgetToken (): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY)
  } catch {
    // nothing stored
  }
}

/** Accepts the whole link shown by the bot window or just the key. */
export function tokenFromInput (text: string): string {
  const trimmed = text.trim()
  try {
    const url = new URL(trimmed)
    return url.searchParams.get('t') || ''
  } catch {
    return trimmed
  }
}

export class ApiError extends Error {
  status: number
  constructor (status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function api<T = unknown> (token: string, path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'X-Panel-Token': token, ...(init.headers || {}) }
    })
  } catch {
    throw new ApiError(0, 'No hay conexión con el bot: ¿sigue abierta su ventana?')
  }
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(response.status, (body as { error?: string }).error || 'El bot no aceptó la orden.')
  return body as T
}

export type Link = 'enlazando' | 'ok' | 'perdido' | 'sin-permiso'

/** Live state of the bot over Server-Sent Events (10 updates per second). */
export function useBotStream (token: string | null) {
  const [state, setState] = useState<BotState | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [link, setLink] = useState<Link>('enlazando')
  const [lastEvent, setLastEvent] = useState<CombatEvent | null>(null)

  useEffect(() => {
    if (!token) return
    setLink('enlazando')
    const source = new EventSource(`/api/events?t=${encodeURIComponent(token)}`)
    source.addEventListener('state', (e) => {
      setState(JSON.parse((e as MessageEvent).data))
      setLink('ok')
    })
    source.addEventListener('history', (e) => setLogs(JSON.parse((e as MessageEvent).data)))
    source.addEventListener('log', (e) => {
      const line = JSON.parse((e as MessageEvent).data) as string
      setLogs((current) => [...current.slice(-199), line])
    })
    source.addEventListener('combat', (e) => setLastEvent(JSON.parse((e as MessageEvent).data)))
    source.onerror = () => {
      setLink('perdido')
      // EventSource hides the status: ask once whether the key is the problem
      fetch('/api/state', { headers: { 'X-Panel-Token': token } })
        .then((response) => {
          if (response.status === 401) {
            setLink('sin-permiso')
            source.close()
          }
        })
        .catch(() => {})
    }
    return () => source.close()
  }, [token])

  return { state, logs, link, lastEvent }
}
