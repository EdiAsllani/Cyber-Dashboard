/**
 * The terminal's contracts — and the seam Phases 4–5 fill (DECISIONS D-03):
 * a command is a name plus a `run` that returns lines. The mock edition's
 * handlers are synchronous flavor; Phase 4 swaps their bodies for API calls
 * and nothing else in the terminal changes.
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
  /** Skin flavor on top of the shared base commands. */
  commands: Command[]
}
