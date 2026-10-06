import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CornerDownLeft } from 'lucide-react'

interface Props {
  logs: string[]
  send: (command: string) => Promise<boolean>
}

/**
 * "[14:02:11] message" → time and message. The panel key in the startup links is masked: a
 * screenshot of the panel must not hand it out (the full links stay in the bot's window).
 */
function split (line: string): { time: string, text: string } {
  const match = line.match(/^\[([^\]]+)\]\s?(.*)$/)
  const time = match ? match[1] : ''
  const text = (match ? match[2] : line).replace(/([?&]t=)[\w-]+/g, '$1••••')
  return { time, text }
}

function tone (text: string): string {
  const lower = text.toLowerCase()
  if (/^(error|expulsado|no pude|el panel no)/.test(lower)) return 'is-bad'
  if (/^(conectado|panel en)/.test(lower)) return 'is-good'
  return ''
}

export function LogPanel ({ logs, send }: Props) {
  const list = useRef<HTMLOListElement>(null)
  const stick = useRef(true)
  const [command, setCommand] = useState('')

  // Follows new lines unless the reader scrolled up
  useEffect(() => {
    const element = list.current
    if (element && stick.current) element.scrollTop = element.scrollHeight
  }, [logs])

  function onScroll () {
    const element = list.current
    if (element) stick.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24
  }

  async function submit (event: FormEvent) {
    event.preventDefault()
    const text = command.trim()
    if (!text) return
    const ok = await send(text.startsWith('!') ? text : `!${text}`)
    if (ok) setCommand('')
  }

  return (
    <section className="block log" aria-labelledby="log-title">
      <header className="block-head">
        <h2 id="log-title" className="tab">Registro</h2>
        <span className="block-meta">También en bot.log</span>
      </header>
      <ol className="log-lines" ref={list} onScroll={onScroll} aria-live="polite" aria-relevant="additions">
        {logs.length === 0 && <li className="log-line is-dim">Nada todavía.</li>}
        {logs.map((line, index) => {
          const { time, text } = split(line)
          return (
            <li key={index} className={'log-line ' + tone(text)}>
              <time>{time}</time>
              <span>{text}</span>
            </li>
          )
        })}
      </ol>
      <form className="log-command" onSubmit={submit}>
        <label htmlFor="command" className="sr-only">Orden para el bot</label>
        <input
          id="command"
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder="Orden, ej. !donde o !diag"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" className="action" disabled={!command.trim()}>
          <CornerDownLeft aria-hidden size={16} strokeWidth={2.25} /> Enviar
        </button>
      </form>
    </section>
  )
}
