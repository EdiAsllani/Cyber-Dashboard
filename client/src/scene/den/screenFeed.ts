/**
 * The idle feed painted onto both monitors: `INTERLINKED` in huge type over a
 * scrolling log. Pure 2D canvas work — no three.js in this file, so the whole
 * thing can be reasoned about (and looked at) on its own.
 *
 * Two constraints shape it:
 *
 * 1. **Bloom threshold is exactly 1.0.** The material multiplies these texels
 *    by `emissiveIntensity`, so only the title is painted hot enough to clear
 *    the threshold and glow. The log text is drawn at 0.75 alpha, which after
 *    sRGB decoding lands around 0.5 in linear space — bright enough to read,
 *    nowhere near bloom. Paint the logs at full white and the whole screen
 *    blooms into an unreadable smear.
 * 2. **Repaints are the cost, not pixels.** `tick` is rate-limited and returns
 *    whether it actually painted, so the caller sets `needsUpdate` only then.
 *    A `CanvasTexture` re-uploads a megabyte to the GPU on every flag.
 */

const W = 1024
const H = 576
/** Title block gets the top 42%; the rest is log. */
const SPLIT = 0.42
const LINE_H = 26
const VISIBLE_LINES = 11
/** Ring buffer is slightly longer than the window so scrolling never gaps. */
const BUFFER = VISIBLE_LINES + 2

const TITLE = 'INTERLINKED'
const TITLE_COLOR = '#ff9db4'
const BG = '#050507'

/** ~20 variants, so two screens seeded differently never read as mirrors. */
const LOG_POOL: readonly string[] = [
  'relic.sys :: handshake OK',
  'cortex/daemon spawned (pid 2077)',
  'WARN ice_probe blocked @ 4th ring',
  'cells. within cells. interlinked.',
  'synapse bridge stable — 62ms',
  'blackwall echo :: 0 packets lost',
  'kiroshi optics recalibrated',
  'WARN thermal creep on deck 2',
  'netwatch sweep — no signature',
  'wallet.sys mounted read/write',
  'repo.net cache warm (14 objects)',
  'dreaming of a womb. dreaming.',
  'ripperdoc log :: 3 entries queued',
  'WARN daemon quarantine tripped',
  'trauma team ping — declined',
  'braindance buffer flushed',
  'arasaka relay :: 401 as expected',
  'interlinked. within cells.',
  'cortex load 0.42 // nominal',
  'WARN unknown shard inserted',
  'subdermal grip auth accepted',
  'night city net :: 41ms to relay',
]

interface LogLine {
  stamp: string
  text: string
  warn: boolean
}

export interface ScreenFeed {
  canvas: HTMLCanvasElement
  /**
   * Advance and maybe repaint. `now` is scene time in seconds, `hz` the
   * repaint ceiling for the current quality tier. Returns true when it painted.
   */
  tick(now: number, hz: number): boolean
}

export function createScreenFeed(seed: number): ScreenFeed {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  const rand = mulberry32(seed)
  const lines: LogLine[] = []
  // A fake wall clock, so the stamps march forward without reading Date and
  // without two screens agreeing on the time.
  let clock = 4 * 3600 + Math.floor(rand() * 3400)
  let nextLine = 0
  let lastPaint = -1
  let cursorPhase = false
  let dirty = true

  for (let i = 0; i < BUFFER; i++) pushLine()

  // Canvas 2D takes fonts from the document, and the Google font almost
  // certainly has not arrived by the time the first frame paints. Nothing to
  // do but repaint once it has.
  if (typeof document !== 'undefined' && document.fonts) {
    void document.fonts.ready.then(() => {
      dirty = true
    })
  }

  function pushLine(): void {
    const text = LOG_POOL[Math.floor(rand() * LOG_POOL.length)]
    clock += 3 + Math.floor(rand() * 26)
    lines.push({ stamp: stampOf(clock), text, warn: text.startsWith('WARN') })
    if (lines.length > BUFFER) lines.shift()
  }

  function paint(): void {
    if (!ctx) return
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, W, H)

    // A faint wash so the panel doesn't read as flat black behind the type.
    const wash = ctx.createLinearGradient(0, 0, 0, H)
    wash.addColorStop(0, 'rgba(197, 0, 60, 0.16)')
    wash.addColorStop(0.55, 'rgba(197, 0, 60, 0.05)')
    wash.addColorStop(1, 'rgba(3, 216, 243, 0.04)')
    ctx.fillStyle = wash
    ctx.fillRect(0, 0, W, H)

    // Title, sized to the panel rather than to a guessed pixel value: the
    // font may be Rajdhani or may still be the fallback, and those two
    // measure very differently.
    const titleBase = H * SPLIT
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = TITLE_COLOR
    ctx.font = `700 200px Rajdhani, system-ui, sans-serif`
    const natural = ctx.measureText(TITLE).width
    const size = Math.min(200, (200 * (W * 0.86)) / Math.max(natural, 1))
    ctx.font = `700 ${size.toFixed(0)}px Rajdhani, system-ui, sans-serif`
    ctx.fillText(TITLE, W / 2, titleBase * 0.54)

    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.font = '16px "Share Tech Mono", monospace'
    ctx.fillStyle = 'rgba(232, 232, 232, 0.55)'
    ctx.fillText('BASELINE // CONSTANT K', 34, titleBase * 0.88)

    // Rule
    ctx.fillStyle = 'rgba(197, 0, 60, 0.55)'
    ctx.fillRect(30, titleBase, W - 60, 2)

    // Log window: newest at the bottom, oldest scrolled off the top.
    ctx.font = '20px "Share Tech Mono", monospace'
    const shown = lines.slice(-VISIBLE_LINES)
    let y = titleBase + 34
    for (const line of shown) {
      // 0.75 alpha on #e8e8e8, 0.8 on #ff003c — both land under the bloom
      // threshold once emissiveIntensity has multiplied them.
      ctx.fillStyle = line.warn ? 'rgba(255, 0, 60, 0.8)' : 'rgba(232, 232, 232, 0.75)'
      ctx.fillText(`[${line.stamp}] ${line.text}`, 34, y)
      y += LINE_H
    }

    // Block cursor on the next, unwritten line.
    if (cursorPhase) {
      ctx.fillStyle = 'rgba(255, 0, 60, 0.85)'
      ctx.fillRect(34, y - 14, 11, 16)
    }
  }

  paint()

  return {
    canvas,
    tick(now, hz) {
      if (now >= nextLine) {
        pushLine()
        // 0.8–1.6s between lines: fast enough to feel alive, slow enough to
        // read from the seat.
        nextLine = now + 0.8 + rand() * 0.8
        dirty = true
      }
      const phase = Math.floor(now * 2) % 2 === 0
      if (phase !== cursorPhase) {
        cursorPhase = phase
        dirty = true
      }
      if (!dirty || now - lastPaint < 1 / hz) return false
      paint()
      dirty = false
      lastPaint = now
      return true
    },
  }
}

function stampOf(totalSeconds: number): string {
  const s = Math.floor(totalSeconds) % 86400
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`
}

const pad = (n: number): string => (n < 10 ? `0${n}` : String(n))

/** Small deterministic PRNG — a seed per monitor, reproducible per reload. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
