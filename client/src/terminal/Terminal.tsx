import { useEffect, useRef } from 'react'
import { useTerminal } from './useTerminal'
import type { TerminalSkin } from './types'

/**
 * The renderer: scrollback, prompt, blinking block cursor.
 *
 * Input is a real (visually hidden) <input> focused on mount and on any click
 * inside the viewport — IME and paste come for free — and its value is drawn
 * into the styled prompt line instead of the element itself.
 */
export function Terminal({ skin }: { skin: TerminalSkin }) {
  const term = useTerminal(skin)
  const viewport = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Pin to the bottom on every new line (and when the prompt appears).
  useEffect(() => {
    const el = viewport.current
    if (el) el.scrollTop = el.scrollHeight
  }, [term.lines, term.ready])

  useEffect(() => {
    if (term.ready) inputRef.current?.focus()
  }, [term.ready])

  return (
    <div
      ref={viewport}
      className="term__viewport"
      onClick={() => inputRef.current?.focus()}
    >
      {term.lines.map((line, i) => (
        <div key={i} className={`term__line${line.kind ? ` term__line--${line.kind}` : ''}`}>
          {line.kind === 'err' ? (
            <span className="term__errglitch" data-text={line.text}>
              {line.text}
            </span>
          ) : (
            line.text
          )}
        </div>
      ))}
      {term.ready && (
        <div className="term__line term__promptline">
          <span className="term__promptname">{skin.prompt} </span>
          <span>{term.input}</span>
          <span className="term__cursor" />
          <input
            ref={inputRef}
            className="term__input"
            value={term.input}
            onChange={(e) => term.setInput(e.target.value)}
            onKeyDown={term.onKeyDown}
            autoFocus
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="terminal input"
          />
        </div>
      )}
    </div>
  )
}
