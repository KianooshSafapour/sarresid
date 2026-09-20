/**
 * Hyper Zeytoon — dependency-free Code 39 barcode generator.
 *
 * Encodes the standard Code 39 (Alpha 39 / USD-3) character set:
 * A-Z, 0-9, dash, dot, space, $, /, +, %  (start/stop char: `*`).
 *
 * Each character = 9 elements (5 bars + 4 spaces, alternating, starting with
 * a bar), exactly 3 of which are WIDE — the canonical published table below.
 * Characters are separated by a single narrow-space inter-character gap.
 * Barcodes are framed by `*` start/stop characters (never shown in the
 * human-readable text) and require a quiet zone (10× narrow) on both sides.
 *
 * Exports:
 *  - `code39Bars(value)` → JSX-friendly run data `[[1|0, width], ...]`
 *    (1 = bar, 0 = space; widths in modules×px, quiet zone NOT included).
 *  - `code39Svg(value, opts)` → standalone inline `<svg>` string, ready for
 *    `dangerouslySetInnerHTML` / email / print sheets.
 */

/* Canonical Code 39 pattern table: 9 elements per char (bar/space alternating
 * starting with a bar); n = narrow, w = wide. Exactly 3 wide per character. */
export const CODE39_PATTERNS: Record<string, string> = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn', '9': 'nnwwnnwnn',
  A: 'wnnnnwnnw', B: 'nnwnnwnnw', C: 'wnwnnwnnn', D: 'nnnnwwnnw',
  E: 'wnnnwwnnn', F: 'nnwnwwnnn', G: 'nnnnnwwnw', H: 'wnnnnwwnn',
  I: 'nnwnnwwnn', J: 'nnnnwwwnn', K: 'wnnnnnnww', L: 'nnwnnnnww',
  M: 'wnwnnnnwn', N: 'nnnnwnnww', O: 'wnnnwnnwn', P: 'nnwnwnnwn',
  Q: 'nnnnnnwww', R: 'wnnnnnwwn', S: 'nnwnnnwwn', T: 'nnnnwnwwn',
  U: 'wwnnnnnnw', V: 'nwwnnnnnw', W: 'wwwnnnnnn', X: 'nwnnwnnnw',
  Y: 'wwnnwnnnn', Z: 'nwwnwnnnn',
  '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn',
  $: 'nwnwnwnnn', '/': 'nwnwnnnwn', '+': 'nwnnnwnwn', '%': 'nnnwnwnwn',
  '*': 'nwnnwnwnn',
}

const CODE39_CHARS = Object.keys(CODE39_PATTERNS).filter((c) => c !== '*')

/** Uppercase + strip anything outside the Code 39 charset (defensive). */
export function sanitizeCode39(value: string): string {
  const up = String(value ?? '').toUpperCase()
  return up
    .split('')
    .filter((c) => CODE39_CHARS.includes(c))
    .join('')
}

export interface Code39Options {
  /** bar height in px (default 48) */
  height?: number
  /** narrow module width in px (default 2) */
  narrow?: number
  /** wide element width in px — defaults to narrow × 2 (ratio clamped 2..3) */
  wide?: number
  /** render the human-readable value below the bars, monospace (default true) */
  showText?: boolean
  /** bar / text ink color (default dark olive #1C2A16) */
  color?: string
  /** emit width=100% + viewBox so the parent container controls size (ratio preserved) */
  responsive?: boolean
}

/** Resolve narrow/wide px honoring the optional `wide` (ratio clamped to spec 2..3). */
function resolveWidths(opts?: Code39Options): { narrow: number; wide: number } {
  const narrow = Math.max(1, opts?.narrow ?? 2)
  let wide = opts?.wide ?? narrow * 2
  const ratio = Math.min(3, Math.max(2, wide / narrow))
  wide = narrow * ratio
  return { narrow, wide }
}

/**
 * Encode value (start/stop `*` included, quiet zone excluded) into run data:
 * an array of `[isBar, widthPx]` pairs — `[1, 4]` = 4px bar, `[0, 2]` = 2px space.
 * Returns `[]` when nothing encodable remains after sanitization.
 */
export function code39Bars(value: string, opts?: Pick<Code39Options, 'narrow' | 'wide'>): number[][] {
  const chars = sanitizeCode39(value)
  if (!chars) return []
  const { narrow, wide } = resolveWidths(opts)
  const runs: number[][] = []
  const push = (isBar: 0 | 1, w: number) => {
    const last = runs[runs.length - 1]
    if (last && last[0] === isBar) last[1] += w
    else runs.push([isBar, w])
  }
  const seq = `*${chars}*`
  seq.split('').forEach((ch, ci) => {
    const pattern = CODE39_PATTERNS[ch]
    for (let i = 0; i < 9; i++) {
      const isBar = (i % 2 === 0 ? 1 : 0) as 0 | 1
      push(isBar, pattern[i] === 'w' ? wide : narrow)
    }
    if (ci < seq.length - 1) push(0, narrow) // inter-character gap
  })
  return runs
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Full inline `<svg>` string for the Code 39 barcode of `value`
 * (uppercase A-Z / 0-9 / - . space $ / + % enforced; unsupported chars dropped).
 * Includes 10× narrow quiet zones, white background, crisp edges and — when
 * `showText` — the human-readable value (without `*`) in monospace below the bars.
 */
export function code39Svg(value: string, opts?: Code39Options): string {
  const runs = code39Bars(value, opts)
  if (runs.length === 0) return ''
  const height = Math.max(16, opts?.height ?? 48)
  const { narrow } = resolveWidths(opts)
  const color = opts?.color ?? '#1C2A16'
  const showText = opts?.showText ?? true
  const quiet = narrow * 10 // spec quiet zone
  const padY = 2

  const barsWidth = runs.reduce((sum, r) => sum + r[1], 0)
  const W = barsWidth + quiet * 2
  const fontSize = Math.max(9, Math.round(narrow * 5.5))
  const textH = showText ? fontSize + 5 : 0
  const H = height + textH + padY * 2

  let x = quiet
  const rects: string[] = []
  for (const [isBar, w] of runs) {
    if (isBar === 1) rects.push(`<rect x="${x}" y="${padY}" width="${w}" height="${height}"/>`)
    x += w
  }

  const text = showText && value
    ? `<text x="${W / 2}" y="${padY + height + fontSize + 1}" text-anchor="middle" font-family="ui-monospace, 'Courier New', monospace" font-size="${fontSize}" letter-spacing="0.12em" fill="${color}">${xmlEscape(sanitizeCode39(value))}</text>`
    : ''

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    (opts?.responsive
      ? `width="100%" style="display:block;height:auto" `
      : `width="${W}" height="${H}" `) +
    `viewBox="0 0 ${W} ${H}" ` +
    `shape-rendering="crispEdges" role="img" aria-label="Code39 ${xmlEscape(sanitizeCode39(value))}">` +
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#FFFFFF"/>` +
    `<g fill="${color}">${rects.join('')}</g>${text}</svg>`
  )
}
