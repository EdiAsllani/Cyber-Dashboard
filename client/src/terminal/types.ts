/**
 * The terminal's contracts — the seam between the CRT and the services
 * (DECISIONS D-03): a command is a name plus a `run` that returns lines.
 * Phase 4 wired WALLET.SYS through it; Phase 5 added `print`/`signal` so a
 * long ceremony (the GitHub device flow) can talk while it waits, and `motd`
 * so a skin can greet the operator — or refuse them — after the banner.
 */

export interface TerminalLine {
  text: string
  /**
   * Rendering hint. `err` gets the glitch treatment, `warn` the hot red,
   * `echo` is the played-back prompt line, `dim` is banner/help chrome.
   */
  kind?: 'out' | 'err' | 'warn' | 'echo' | 'dim'
}

export interface CommandCtx {
  /** Wipes the scrollback — `clear` is the only caller today. */
  clear(): void
  /** Append lines *now*, before `run` resolves — progress during a long wait. */
  print(lines: TerminalLine[]): void
  /** Fires when the terminal unmounts (ESC). Long-running commands stop on it. */
  signal: AbortSignal
}

export interface Command {
  name: string
  /** Argument hint for `help`, e.g. '<text>'. Empty when the command takes none. */
  args: string
  help: string
  run(argv: string[], ctx: CommandCtx): Promise<TerminalLine[]> | TerminalLine[]
}

export interface TerminalSkin {
  /** History bucket key — histories are per-skin and in-memory only. */
  id: 'wallet' | 'repo'
  /** The CRT frame's header line. */
  title: string
  /** Rendered before the input, e.g. 'wallet>'. */
  prompt: string
  /** Typed out at ~20ms/char on boot (instantly under reduced motion). */
  banner: string[]
  /** Printed once the banner is done — session state, ACCESS DENIED hints. */
  motd?: () => Promise<TerminalLine[]>
  /** Skin flavor on top of the shared base commands. */
  commands: Command[]
}
