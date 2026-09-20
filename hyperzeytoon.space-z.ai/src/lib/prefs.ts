// ============================================================================
// Hyper Zeytoon — user appearance preferences (theme / accent / density /
// pattern / font scale / sidebar layout). Single source of truth for both the
// pre-paint inline script (layout.tsx) and the store (store/app.ts).
//
// Prefs contract (shared with the server — see api/auth/prefs/route.ts):
//   {
//     theme: 'light' | 'dark' | 'system'
//     accent: 'pistachio' | 'saffron' | 'pomegranate' | 'copper' | 'turquoise'
//     density: 'comfortable' | 'compact'
//     pattern: 'boteh' | 'paisley' | 'plain'
//     fontScale: number  // 0.9 .. 1.15 (multiplier on 16px root)
//     sidebarOrder?: Record<string, number>  // NAV_GROUP TITLE → order index
//     sidebarHidden?: string[]               // NAV_GROUP TITLEs turned off
//     locale?: string
//   }
// Stored as JSON under localStorage 'hz_prefs' and on User.prefs (server).
// ============================================================================

import { isValidPattern, isValidPalette } from '@/lib/avatar'

export const PREFS_KEY = 'hz_prefs'

export type ThemeChoice = 'light' | 'dark' | 'system'
export type AccentChoice = 'pistachio' | 'saffron' | 'pomegranate' | 'copper' | 'turquoise'
export type DensityChoice = 'comfortable' | 'compact'
export type PatternChoice = 'boteh' | 'paisley' | 'plain'

export interface UserPrefs {
  theme: ThemeChoice
  accent: AccentChoice
  density: DensityChoice
  pattern: PatternChoice
  fontScale: number
  sidebarOrder?: Record<string, number>
  sidebarHidden?: string[]
  locale?: string
  /** pinned avatar style (Appearance Studio → «آواتار من»); null = auto */
  avatar?: { pattern: string; palette: string } | null
}

export const DEFAULT_PREFS: UserPrefs = {
  theme: 'light',
  accent: 'pistachio',
  density: 'comfortable',
  pattern: 'boteh',
  fontScale: 1,
  avatar: null, // null = automatic (deterministic) avatar style
}

export const FONT_SCALE_MIN = 0.9
export const FONT_SCALE_MAX = 1.15

/** Accent catalog for the Appearance Studio swatches (light hex = swatch). */
export const ACCENTS: { key: AccentChoice; label: string; swatch: string; hint: string }[] = [
  { key: 'pistachio', label: 'پسته‌ای', swatch: '#3E7C59', hint: 'سبز پسته کرمان' },
  { key: 'saffron', label: 'زعفرانی', swatch: '#D4A017', hint: 'طلایی زعفران' },
  { key: 'pomegranate', label: 'اناری', swatch: '#B33A3A', hint: 'سرخ انار' },
  { key: 'copper', label: 'مسی', swatch: '#B87333', hint: 'سفالگری کرمان' },
  { key: 'turquoise', label: 'فیروزه‌ای', swatch: '#2E8E8E', hint: 'کاشی فیروزه' },
]

export const THEMES: { key: ThemeChoice; label: string; hint: string }[] = [
  { key: 'light', label: 'روشن', hint: 'کاشی و خامه — روشن' },
  { key: 'dark', label: 'شب کویر', hint: 'زغالی گرم با طلایی درخشان' },
  { key: 'system', label: 'سیستمی', hint: 'هماهنگ با تنظیمات دستگاه' },
]

export const PATTERNS: { key: PatternChoice; label: string; hint: string }[] = [
  { key: 'boteh', label: 'بته‌جقه', hint: 'طرح سنتی بته‌جقه کرمان' },
  { key: 'paisley', label: 'اسلیمی', hint: 'شبکه ستاره‌های کاشی‌کاری' },
  { key: 'plain', label: 'ساده', hint: 'بدون طرح پس‌زمینه' },
]

function clampFontScale(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 1
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, v))
}

/** Lenient read of stored prefs — never throws, always returns a full shape. */
export function loadPrefs(): UserPrefs {
  if (typeof window === 'undefined') return { ...DEFAULT_PREFS }
  try {
    const raw = window.localStorage.getItem(PREFS_KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    const p = JSON.parse(raw) as Partial<UserPrefs>
    return {
      theme: p.theme === 'dark' || p.theme === 'system' ? p.theme : 'light',
      accent: ACCENTS.some((a) => a.key === p.accent) ? (p.accent as AccentChoice) : 'pistachio',
      density: p.density === 'compact' ? 'compact' : 'comfortable',
      pattern: p.pattern === 'paisley' || p.pattern === 'plain' ? p.pattern : 'boteh',
      fontScale: clampFontScale(p.fontScale),
      sidebarOrder:
        p.sidebarOrder && typeof p.sidebarOrder === 'object'
          ? Object.fromEntries(
              Object.entries(p.sidebarOrder).map(([k, v]) => [k, Number(v)]).filter(([, v]) => Number.isFinite(v as number))
            )
          : undefined,
      sidebarHidden: Array.isArray(p.sidebarHidden) ? p.sidebarHidden.filter((x) => typeof x === 'string') : undefined,
      locale: typeof p.locale === 'string' ? p.locale : undefined,
      avatar:
        p.avatar && typeof p.avatar === 'object' && isValidPattern(p.avatar.pattern) && isValidPalette(p.avatar.palette)
          ? { pattern: p.avatar.pattern, palette: p.avatar.palette }
          : p.avatar === null
            ? null
            : undefined,
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function savePrefs(prefs: UserPrefs) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* storage full/blocked — prefs stay session-only */
  }
}

/** Resolve 'system' against the OS preference (enableSystem=false in
 *  ThemeProvider — we own the explicit control). */
export function resolveTheme(theme: ThemeChoice): 'light' | 'dark' {
  if (theme === 'system' && typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme === 'dark' ? 'dark' : 'light'
}

/**
 * Apply prefs to the document element — class 'dark', data-accent /
 * data-density / data-pattern attributes and the root font size.
 * Must only run client-side (store calls it from effects / user actions,
 * layout.tsx inline script does the pre-paint pass).
 */
export function applyUserPrefs(prefs: UserPrefs) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const resolved = resolveTheme(prefs.theme)
  root.classList.toggle('dark', resolved === 'dark')
  root.dataset.accent = prefs.accent
  root.dataset.density = prefs.density
  root.dataset.pattern = prefs.pattern
  root.style.fontSize = `${(prefs.fontScale * 16).toFixed(2)}px`
  // keep next-themes' storage in agreement so its boot script never fights us
  try {
    window.localStorage.setItem('theme', resolved)
  } catch {
    /* ignore */
  }
  return resolved
}

/**
 * Watch OS color-scheme changes while theme = 'system'.
 * Returns a cleanup function. Installed once by the store on first user load.
 */
export function watchSystemTheme(getPrefs: () => UserPrefs, onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = () => {
    if (getPrefs().theme === 'system') onChange()
  }
  mq.addEventListener('change', handler)
  return () => mq.removeEventListener('change', handler)
}

// ---------------------------------------------------------------------------
// Debounced server sync — PATCH /api/auth/prefs at most once per 1.2s while
// the user drags sliders / toggles. Fire-and-forget; never throws.
// ---------------------------------------------------------------------------
let syncTimer: ReturnType<typeof setTimeout> | null = null
let lastSynced: string | null = null

export function scheduleServerSync(prefs: UserPrefs) {
  if (typeof window === 'undefined') return
  const payload = JSON.stringify(prefs)
  if (payload === lastSynced) return
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(async () => {
    syncTimer = null
    lastSynced = payload
    try {
      const token = window.localStorage.getItem('hz_session_token')
      const res = await fetch('/api/auth/prefs', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'x-session-token': token } : {}),
        },
        body: JSON.stringify({ prefs }),
        credentials: 'same-origin',
      })
      if (res.status === 401) lastSynced = null // retry next change after login
    } catch {
      lastSynced = null // offline — allow retry on next change
    }
  }, 1200)
}
