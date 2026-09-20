// ============================================================================
// Hyper Zeytoon — Professional Digital Avatar System
// ----------------------------------------------------------------------------
// Gorgeous, business-safe, culturally rooted avatars. Zero network cost:
// everything is deterministic SVG rendered inline (patterns are 4–8 static
// paths, no animation, no images, no fonts).
//
// Design rules (locked):
//  1. Initials are NEVER naive first-letters. Naive initials of Persian names
//     can accidentally form obscene or embarrassing letter pairs (the real
//     case: «کیانوش صفاپور» → «کص»). safeInitials() checks a curated
//     blocklist and falls back to professional alternatives.
//  2. Every user gets a stable, elegant avatar even without any settings —
//     hashed deterministically from username/name so the same person looks
//     identical everywhere in the platform.
//  3. Fully customizable: a user may pin a pattern + palette in their prefs
//     (Appearance Studio → «آواتار من»); the pinned config travels with the
//     account across devices.
//  4. Palettes are warm, formal and professional (pistachio, saffron, copper,
//     olive, pomegranate, walnut…) — no casual/neon tones, no indigo/blue.
// ============================================================================

// ---------------- safe initials ---------------------------------------------

/** ZWNJ / NBSP and Arabic look-alikes normalised to plain Persian forms. */
function normalizeName(name: string): string {
  return (name ?? '')
    .replace(/[\u200b\u200c\u200d\u2060]/g, ' ') // ZWNJ family → space
    .replace(/\u00a0/g, ' ') // NBSP
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u064b-\u065f\u0670]/g, '') // diacritics
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Letter pairs that must never appear as someone's initials.
 * (Persian obscenities / crude slang / embarrassing combos.)
 */
const UNSAFE_PAIRS = new Set([
  'کص', 'کس', 'کون', 'کیر', 'جند', 'جیش', 'خره', 'لخت', 'گای', 'فج',
  // borderline / unprofessional two-letter reads
  'خر', // خرم، خشایار + ر… → donkey slang
  'جن', // جواد + ن… → "jinn"
  'گه', // vulgar slang
])

/** Latin pairs that would look unprofessional on a business badge. */
const UNSAFE_PAIRS_LATIN = new Set(['kk', 'fk', 'xx', 'qq'])

function isSafePair(pair: string): boolean {
  if (UNSAFE_PAIRS.has(pair)) return false
  if (UNSAFE_PAIRS_LATIN.has(pair.toLowerCase())) return false
  return true
}

/**
 * Professional-safe initials for any name.
 *  «کیانوش صفاپور»  → کص is blocked  → «کی»
 *  «مریم درویشی»    → «مد»
 *  «جواد نوروزی»    → «جن» would be jinn — kept (not offensive), formal.
 *  Single-word name → first two letters («سارا» → «سا»), never a lone risky pair.
 */
export function safeInitials(name: string): string {
  const norm = normalizeName(name)
  if (!norm) return '؟'
  const parts = norm.split(' ').filter(Boolean)
  const first = parts[0] ?? ''

  // candidate 1 — classic initials (first letters of up to two words)
  if (parts.length >= 2) {
    const cand = (first[0] ?? '') + (parts[1][0] ?? '')
    if (cand && isSafePair(cand)) return cand
  }

  // candidate 2 — first two letters of the first word
  if (first.length >= 2) {
    const cand = first.slice(0, 2)
    if (isSafePair(cand)) return cand
  }

  // candidate 3 — single first letter (always safe)
  return first.slice(0, 1) || '؟'
}

// ---------------- palettes ---------------------------------------------------

export interface AvatarPalette {
  key: string
  label: string
  hint: string
  /** gradient stops (from = deep, to = lifted) */
  from: string
  to: string
  /** initials ink (warm cream on every palette) */
  ink: string
  /** ornamental stroke + seal ring */
  ring: string
}

export const AVATAR_PALETTES: AvatarPalette[] = [
  { key: 'emerald', label: 'زمردی', hint: 'سبز زمردی رسمی', from: '#1d5c45', to: '#3e7c59', ink: '#f4efe2', ring: '#c9a227' },
  { key: 'pistachio', label: 'پسته‌ای', hint: 'سبز پسته کرمان', from: '#3e7c59', to: '#6fa287', ink: '#fffdf6', ring: '#f0e6c8' },
  { key: 'olive', label: 'زیتونی', hint: 'زیتون رودبار', from: '#5a6144', to: '#8a8f5f', ink: '#fffdf6', ring: '#d8d2a5' },
  { key: 'saffron', label: 'زعفرانی', hint: 'طلایی زعفران', from: '#a87715', to: '#d4a017', ink: '#fff9e8', ring: '#f4e2b8' },
  { key: 'copper', label: 'مسی', hint: 'سفالگری کرمان', from: '#8a4b26', to: '#b87333', ink: '#fff3e4', ring: '#ecc9a3' },
  { key: 'pomegranate', label: 'اناری', hint: 'سرخ انار یزد', from: '#8e2f35', to: '#b3494f', ink: '#ffeee9', ring: '#e8b4a0' },
  { key: 'walnut', label: 'گردویی', hint: 'چوب گردو', from: '#5d4a36', to: '#7c6248', ink: '#fdf6e9', ring: '#d9c4a5' },
  { key: 'palm', label: 'نخلی', hint: 'سبز نخل و فیروزه', from: '#215e56', to: '#2e8e8e', ink: '#eefaf6', ring: '#bfe3d9' },
]

// ---------------- patterns ----------------------------------------------------

export interface AvatarPatternMeta {
  key: string
  label: string
  hint: string
}

export const AVATAR_PATTERNS: AvatarPatternMeta[] = [
  { key: 'boteh', label: 'بته‌جقه', hint: 'طرح اصیل بته‌جقه کرمان' },
  { key: 'girih', label: 'گره‌چینی', hint: 'ستاره هشت‌پر کاشی‌کاری' },
  { key: 'shamsa', label: 'شمسه', hint: 'مدالیون خورشیدی گنبد' },
  { key: 'cypress', label: 'سرو', hint: 'سرو آزاد، نماد ایستادگی' },
  { key: 'olive', label: 'زیتون', hint: 'شاخه زیتون رودبار' },
  { key: 'pistachio', label: 'پسته', hint: 'میوه پسته با شکاف خندان' },
  { key: 'jajim', label: 'جاجیم', hint: 'بافت مورب عشایری' },
  { key: 'khatam', label: 'خاتم', hint: 'منظومه الماس‌های خاتم‌کاری' },
]

export type AvatarPatternKey = string

// ---------------- config resolution -------------------------------------------

export interface AvatarConfig {
  pattern: AvatarPatternKey
  palette: string
}

/** FNV-1a — tiny, stable, distribution good enough for style picking. */
function hash32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function paletteByKey(key: string | undefined): AvatarPalette {
  return AVATAR_PALETTES.find((p) => p.key === key) ?? AVATAR_PALETTES[0]
}

export function patternByKey(key: string | undefined): AvatarPatternMeta {
  return AVATAR_PATTERNS.find((p) => p.key === key) ?? AVATAR_PATTERNS[0]
}

export function isValidPattern(key: unknown): key is string {
  return typeof key === 'string' && AVATAR_PATTERNS.some((p) => p.key === key)
}

export function isValidPalette(key: unknown): key is string {
  return typeof key === 'string' && AVATAR_PALETTES.some((p) => p.key === key)
}

/**
 * Resolve the avatar config for a person:
 *  1. explicit pinned prefs (validated) win,
 *  2. otherwise deterministic hash of username (fallback: name) —
 *     the same person always renders the same beautiful avatar everywhere.
 */
export function avatarConfigFor(
  name: string,
  username?: string,
  pinned?: { pattern?: unknown; palette?: unknown } | null
): AvatarConfig {
  const pattern = isValidPattern(pinned?.pattern) ? pinned.pattern : undefined
  const palette = isValidPalette(pinned?.palette) ? pinned.palette : undefined
  if (pattern && palette) return { pattern, palette }
  const seed = hash32((username || name || 'hz').trim())
  return {
    pattern: pattern ?? AVATAR_PATTERNS[seed % AVATAR_PATTERNS.length].key,
    palette: palette ?? AVATAR_PALETTES[(seed >>> 8) % AVATAR_PALETTES.length].key,
  }
}

/** Parse the avatar block out of a raw User.prefs JSON string (never throws). */
export function parseAvatarPrefs(prefsJson: string | null | undefined): { pattern?: string; palette?: string } | null {
  if (!prefsJson) return null
  try {
    const p = JSON.parse(prefsJson) as { avatar?: { pattern?: unknown; palette?: unknown } }
    if (!p || typeof p !== 'object' || !p.avatar) return null
    const out: { pattern?: string; palette?: string } = {}
    if (isValidPattern(p.avatar.pattern)) out.pattern = p.avatar.pattern
    if (isValidPalette(p.avatar.palette)) out.palette = p.avatar.palette
    return Object.keys(out).length ? out : null
  } catch {
    return null
  }
}
