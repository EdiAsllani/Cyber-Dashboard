import type { Command, CommandCtx, TerminalLine } from './types'

/**
 * Command registry: parse, complete, run. Built per skin from the shared base
 * set plus the skin's flavor commands; `help` is generated from the final
 * list so it can never drift from what is actually runnable.
 *
 * Ambition guard (D-07): no PTY, no xterm, no grammar — a command line is
 * whitespace-split tokens and the first one picks the handler.
 */

export interface Registry {
  /** Sorted command names — the completer's corpus. */
  names: string[]
  /** Run one input line. Unknown commands come back as an `err` line. */
  run(input: string, ctx: CommandCtx): Promise<TerminalLine[]> | TerminalLine[]
  /**
   * Tab completion over command names. `hit` is the extended token (with a
   * trailing space when unambiguous); `matches` lists candidates for the
   * double-Tab case.
   */
  complete(token: string): { hit: string | null; matches: string[] }
}

/** Session start, for `status`'s fake uptime. Module scope on purpose. */
const BOOTED_AT = Date.now()

function uptime(): string {
  const s = Math.floor((Date.now() - BOOTED_AT) / 1000)
  const h = String(Math.floor(s / 3600)).padStart(2, '0')
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  return `${h}:${m}:${String(s % 60).padStart(2, '0')}`
}

/** Shared by both skins. `help` is appended by `createRegistry`. */
const BASE: Command[] = [
  {
    name: 'clear',
    args: '',
    help: 'wipe the scrollback',
    run: (_argv, ctx) => {
      ctx.clear()
      return []
    },
  },
  {
    name: 'whoami',
    args: '',
    help: 'current operator',
    run: () => [{ text: 'edi // netrunner-1' }],
  },
  {
    name: 'echo',
    args: '<text>',
    help: 'print it back',
    run: (argv) => [{ text: argv.join(' ') }],
  },
  {
    name: 'status',
    args: '',
    help: 'link diagnostics',
    // The one allowed real API call (it already exists): /api/health through
    // the vite proxy. Everything else in the mock edition is flavor.
    run: async () => {
      const lines: TerminalLine[] = [
        { text: `uplink        :: ${uptime()} since jack-in` },
        { text: 'route         :: night city relay // 4 hops' },
      ]
      try {
        const r = await fetch('/api/health')
        const d = (await r.json()) as { db: boolean }
        lines.push({
          text: `relay /api/health :: ${d.db ? 'BREACHED' : 'UP // DB OFFLINE'}`,
          kind: d.db ? 'out' : 'warn',
        })
      } catch {
        lines.push({ text: 'relay /api/health :: NO CARRIER', kind: 'err' })
      }
      return lines
    },
  },
]

export function createRegistry(flavor: Command[]): Registry {
  const all: Command[] = [...BASE, ...flavor]

  const pad = Math.max(...all.map((c) => (c.name + ' ' + c.args).trim().length), 'help'.length)
  all.push({
    name: 'help',
    args: '',
    help: 'this list',
    run: () =>
      [...all]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({
          text: `${(c.name + ' ' + c.args).trim().padEnd(pad + 3)}${c.help}`,
          kind: 'dim' as const,
        })),
  })

  const byName = new Map(all.map((c) => [c.name, c]))
  const names = [...byName.keys()].sort()

  return {
    names,
    run(input, ctx) {
      const argv = input.trim().split(/\s+/)
      const cmd = byName.get(argv[0])
      if (!cmd) return [{ text: `COMMAND NOT RECOGNIZED: ${argv[0]}`, kind: 'err' }]
      return cmd.run(argv.slice(1), ctx)
    },
    complete(token) {
      if (!token) return { hit: null, matches: [] }
      const matches = names.filter((n) => n.startsWith(token))
      if (matches.length === 0) return { hit: null, matches }
      if (matches.length === 1) return { hit: matches[0] + ' ', matches }
      // Longest common prefix across the candidates.
      let common = matches[0]
      for (const m of matches) {
        while (!m.startsWith(common)) common = common.slice(0, -1)
      }
      return { hit: common.length > token.length ? common : null, matches }
    },
  }
}
