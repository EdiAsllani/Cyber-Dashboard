/**
 * Terminal formatting: eddies, tables, progress bars, timestamps. The CRT
 * viewport is narrow — keep composed lines ≤ ~70 chars and truncate with `…`
 * rather than letting the renderer wrap.
 */

const NUM = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** `€$ 2,077.00` — negative amounts keep the sign ahead of the glyph. */
export function eddies(amount: number): string {
  return `${amount < 0 ? '-' : ''}€$ ${NUM.format(Math.abs(amount))}`
}

/** `+€$ 950.00` / `-€$ 180.50` — for signed ledger rows. */
export function signedEddies(amount: number): string {
  return `${amount < 0 ? '-' : '+'}€$ ${NUM.format(Math.abs(amount))}`
}

/** `[████──────] 42%` */
export function bar(fraction: number, width = 10): string {
  const clamped = Math.max(0, Math.min(1, fraction))
  const filled = Math.round(clamped * width)
  return `[${'█'.repeat(filled)}${'─'.repeat(width - filled)}] ${Math.round(clamped * 100)}%`
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`
}

/** `SEP 02 14:33` in the viewer's locale/timezone. */
export function stamp(iso: string): string {
  const d = new Date(iso)
  const mon = d.toLocaleString('en-US', { month: 'short' }).toUpperCase()
  const day = String(d.getDate()).padStart(2, '0')
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${mon} ${day} ${hm}`
}

/**
 * Pad columns to their widest cell. `right` marks right-aligned columns
 * (numbers). Returns one string per row, two spaces between columns.
 */
export function table(rows: string[][], right: boolean[] = []): string[] {
  if (!rows.length) return []
  const widths = rows[0].map((_, col) => Math.max(...rows.map((r) => r[col]?.length ?? 0)))
  return rows.map((r) =>
    r
      .map((cell, col) => (right[col] ? cell.padStart(widths[col]) : cell.padEnd(widths[col])))
      .join('  ')
      .trimEnd(),
  )
}

/**
 * Parse a user-typed amount: `1500`, `1,500`, `2077.50`. Null when it isn't
 * a positive number with at most two decimals.
 */
export function parseAmount(token: string | undefined): number | null {
  if (!token) return null
  const cleaned = token.replace(/,/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const n = Number(cleaned)
  return n > 0 ? n : null
}
