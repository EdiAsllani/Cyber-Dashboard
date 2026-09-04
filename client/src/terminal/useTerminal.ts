import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRegistry } from './registry'
import { useJourney } from '../state/journey'
import type { TerminalLine, TerminalSkin } from './types'

/**
 * Everything the terminal *is* — scrollback, input, history, completion —
 * with rendering left entirely to `Terminal.tsx`.
 *
 * Ambition guard (D-07): the scrollback is a 200-line array and CSS overflow,
 * not a virtualized buffer; history is per-skin and in-memory only.
 */

const MAX_LINES = 200
/** Boot banner typing speed. Reduced motion renders the banner instantly. */
const TYPE_MS = 20

/** Survives open → ESC → reopen, dies with the tab. Deliberately not stored. */
const HISTORIES = new Map<string, string[]>()

export interface TerminalHandle {
  lines: TerminalLine[]
  input: string
  /** False while the banner is still typing — the prompt hasn't appeared yet. */
  ready: boolean
  setInput: (v: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
}

export function useTerminal(skin: TerminalSkin): TerminalHandle {
  const registry = useMemo(() => createRegistry(skin.commands), [skin])
  const [lines, setLines] = useState<TerminalLine[]>([])
  const [input, setInput] = useState('')
  const [ready, setReady] = useState(false)

  /** -1 = editing a fresh line, otherwise an index into the skin's history. */
  const historyIndex = useRef(-1)
  /** What was being typed before ↑ started recalling. */
  const draft = useRef('')
  /** The token the previous Tab saw — an unchanged repeat means "list them". */
  const lastTab = useRef<string | null>(null)
  /** Aborted on unmount so a waiting command (the login poll) stops with the CRT. */
  const aborter = useRef<AbortController>(new AbortController())

  // Boot banner. The typed-so-far state derives from one char counter, so the
  // effect is idempotent — StrictMode's double-run just restarts the typing.
  useEffect(() => {
    const banner = skin.banner
    const total = banner.reduce((n, t) => n + t.length, 0)
    const render = (chars: number): TerminalLine[] => {
      const out: TerminalLine[] = []
      let left = chars
      for (const text of banner) {
        if (left <= 0) break
        out.push({ text: text.slice(0, left), kind: 'dim' })
        left -= text.length
      }
      return out
    }
    if (useJourney.getState().reducedMotion) {
      setLines(render(total))
      setReady(true)
      return
    }
    let n = 0
    const id = window.setInterval(() => {
      n++
      setLines(render(n))
      if (n >= total) {
        window.clearInterval(id)
        setReady(true)
      }
    }, TYPE_MS)
    return () => window.clearInterval(id)
  }, [skin])

  const push = useCallback((add: TerminalLine[]) => {
    if (!add.length) return
    setLines((prev) => {
      const next = prev.concat(add)
      return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next
    })
  }, [])

  // One AbortController per mount. StrictMode's dry run aborts the first and
  // the effect re-arms, so the live controller is always the un-aborted one.
  useEffect(() => {
    aborter.current = new AbortController()
    const ac = aborter.current
    return () => ac.abort()
  }, [skin])

  // Motd after the banner: session state, or the ACCESS DENIED hint.
  useEffect(() => {
    if (!ready || !skin.motd) return
    let live = true
    void skin.motd().then((lines) => {
      if (live) push(lines)
    })
    return () => {
      live = false
    }
  }, [ready, skin, push])

  const submit = useCallback(() => {
    const value = input
    setInput('')
    historyIndex.current = -1
    lastTab.current = null
    // Echo first, run second: `clear` wipes synchronously mid-run, and the
    // wipe is supposed to take the echoed line with it.
    push([{ text: `${skin.prompt} ${value}`.trimEnd(), kind: 'echo' }])
    if (!value.trim()) return
    const hist = HISTORIES.get(skin.id) ?? []
    if (hist[hist.length - 1] !== value) hist.push(value)
    HISTORIES.set(skin.id, hist)
    const result = registry.run(value, {
      clear: () => setLines([]),
      print: push,
      signal: aborter.current.signal,
    })
    if (Array.isArray(result)) push(result)
    else void result.then(push)
  }, [input, push, registry, skin])

  /** ↑ (delta -1) walks toward older entries, ↓ (+1) back toward the draft. */
  const recall = useCallback(
    (delta: -1 | 1) => {
      const hist = HISTORIES.get(skin.id) ?? []
      if (!hist.length) return
      if (historyIndex.current === -1) {
        if (delta === 1) return
        draft.current = input
        historyIndex.current = hist.length - 1
      } else {
        const next = historyIndex.current + delta
        if (next < 0) return
        if (next >= hist.length) {
          historyIndex.current = -1
          setInput(draft.current)
          return
        }
        historyIndex.current = next
      }
      setInput(hist[historyIndex.current])
    },
    [input, skin],
  )

  const complete = useCallback(() => {
    // Only the command token completes; once an argument starts, Tab is inert.
    if (input.includes(' ') || !input) return
    const { hit, matches } = registry.complete(input)
    if (hit) {
      setInput(hit)
      lastTab.current = null
      return
    }
    if (matches.length > 1) {
      if (lastTab.current === input) {
        push([{ text: matches.join('   '), kind: 'dim' }])
        lastTab.current = null
      } else {
        lastTab.current = input
      }
    }
  }, [input, push, registry])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        submit()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        recall(-1)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        recall(1)
      } else if (e.key === 'Tab') {
        e.preventDefault()
        complete()
      }
      // Escape is deliberately untouched: it bubbles to the overlay's
      // listener, which owns the disconnect.
    },
    [complete, recall, submit],
  )

  return { lines, input, ready, setInput, onKeyDown }
}
