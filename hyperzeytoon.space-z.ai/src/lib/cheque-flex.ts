// ============================================================
// Cheque due-date flexibility model (انعطاف سررسید چک)
// Shared by: POST /api/cheques/planner, PATCH /api/settings,
// and the Payments UI (calendar badges + planner preview).
//
// Setting key `cheque_flexibility` (Settings table, JSON string):
//   { "default": 0, "levels": [{ scope, key, days }, ...] }
//   scope ∈ YEAR | SEASON | MONTH | WEEK | DAY  (key formats: src/lib/jalali.ts)
// Resolution: most specific matching level wins (DAY > WEEK > MONTH >
// SEASON > YEAR); otherwise `default` applies.
// ============================================================
import { toJalali, pad2, jalaliSeasonOf, jalaliMonthWeekOf, jalaliMonthLength, toFaDigits } from './jalali'

export const FLEX_SCOPES = ['YEAR', 'SEASON', 'MONTH', 'WEEK', 'DAY'] as const
export type FlexScope = (typeof FLEX_SCOPES)[number]

export const FLEX_SCOPE_FA: Record<FlexScope, string> = {
  YEAR: 'سال',
  SEASON: 'فصل',
  MONTH: 'ماه',
  WEEK: 'هفته',
  DAY: 'روز',
}

export const SEASON_FA: Record<string, string> = {
  BAHAR: 'بهار',
  TABESTAN: 'تابستان',
  PAEEZ: 'پاییز',
  ZEMESTAN: 'زمستان',
}

export interface FlexLevel {
  scope: FlexScope
  key: string
  days: number
}

export interface FlexibilityConfig {
  default: number
  levels: FlexLevel[]
}

// validity of a scope key (also Jalali year sanity 1200..1600)
const KEY_PATTERNS: Record<FlexScope, RegExp> = {
  YEAR: /^(12[0-9]{2}|13[0-9]{2}|14[0-9]{2}|15[0-9]{2}|1600)$/,
  SEASON: /^(12[0-9]{2}|13[0-9]{2}|14[0-9]{2}|15[0-9]{2}|1600)-(BAHAR|TABESTAN|PAEEZ|ZEMESTAN)$/,
  MONTH: /^(12[0-9]{2}|13[0-9]{2}|14[0-9]{2}|15[0-9]{2}|1600)-(0[1-9]|1[0-2])$/,
  WEEK: /^(12[0-9]{2}|13[0-9]{2}|14[0-9]{2}|15[0-9]{2}|1600)-(0[1-9]|1[0-2])-W[1-5]$/,
  DAY: /^(12[0-9]{2}|13[0-9]{2}|14[0-9]{2}|15[0-9]{2}|1600)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|30|31)$/,
}

/** inline examples shown as placeholders in the settings editor */
export const FLEX_KEY_EXAMPLES: Record<FlexScope, string> = {
  YEAR: '۱۴۰۴',
  SEASON: '۱۴۰۴-BAHAR (بهار)',
  MONTH: '۱۴۰۴-۰۳',
  WEEK: '۱۴۰۴-۰۳-W2 (هفتهٔ دوم ماه)',
  DAY: '۱۴۰۴-۰۳-۱۵',
}

/** build the scope key of a given date */
export function scopeKeyFor(scope: FlexScope, date: Date): string {
  const j = toJalali(date)
  switch (scope) {
    case 'YEAR':
      return String(j.jy)
    case 'SEASON':
      return `${j.jy}-${jalaliSeasonOf(j.jm)}`
    case 'MONTH':
      return `${j.jy}-${pad2(j.jm)}`
    case 'WEEK':
      return `${j.jy}-${pad2(j.jm)}-W${jalaliMonthWeekOf(j.jd)}`
    case 'DAY':
      return `${j.jy}-${pad2(j.jm)}-${pad2(j.jd)}`
  }
}

const clampDays = (v: unknown): number => {
  const n = Math.floor(Number(v))
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(90, n)
}

/** Persian label of a level key for tooltips/chips (e.g. «ماه ۱۴۰۴/۰۳») */
export function flexKeyLabelFa(level: FlexLevel): string {
  const jy = level.key.slice(0, 4)
  const rest = level.key.slice(5)
  switch (level.scope) {
    case 'YEAR':
      return `سال ${toFaDigits(jy)}`
    case 'SEASON': {
      const s = rest.split('-')[0] ?? ''
      return `${SEASON_FA[s] ?? s} ${toFaDigits(jy)}`
    }
    case 'MONTH':
      return `ماه ${toFaDigits(`${jy}/${rest}`)}`
    case 'WEEK': {
      const [jm, w] = rest.split('-W')
      return `هفتهٔ ${toFaDigits(w ?? '')} ماه ${toFaDigits(`${jy}/${jm ?? ''}`)}`
    }
    case 'DAY': {
      const [jm, jd] = rest.split('-')
      return `روز ${toFaDigits(`${jy}/${jm ?? ''}/${jd ?? ''}`)}`
    }
  }
}

/**
 * Parse the stored JSON string defensively — anything invalid is dropped,
 * so the planner never crashes on a corrupted setting.
 */
export function parseFlexibility(raw: string | null | undefined): FlexibilityConfig {
  const fallback: FlexibilityConfig = { default: 0, levels: [] }
  if (!raw) return fallback
  try {
    const obj = JSON.parse(raw) as Partial<FlexibilityConfig>
    const levels: FlexLevel[] = []
    if (Array.isArray(obj.levels)) {
      const seen = new Set<string>()
      for (const l of obj.levels.slice(0, 50)) {
        const scope = (l as FlexLevel)?.scope
        const key = String((l as FlexLevel)?.key ?? '')
        if (!scope || !FLEX_SCOPES.includes(scope)) continue
        if (!KEY_PATTERNS[scope].test(key)) continue
        if (scope === 'DAY') {
          const [jy, jm, jd] = key.split('-').map(Number)
          if (jd > jalaliMonthLength(jy, jm)) continue
        }
        const dedupeKey = `${scope}|${key}`
        if (seen.has(dedupeKey)) continue
        seen.add(dedupeKey)
        levels.push({ scope, key, days: clampDays((l as FlexLevel).days) })
      }
    }
    return { default: clampDays(obj.default), levels }
  } catch {
    return fallback
  }
}

export type FlexValidation =
  | { ok: true; config: FlexibilityConfig }
  | { ok: false; error: string }

/**
 * Strict validation for the settings PATCH (manager-only).
 * Rules: default 0..90, levels ≤ 50, known scope, key pattern per scope,
 * days 0..90, no duplicate (scope, key). Persian error messages.
 */
export function validateFlexibilityInput(value: unknown): FlexValidation {
  let obj: unknown = value
  if (typeof value === 'string') {
    try {
      obj = JSON.parse(value)
    } catch {
      return { ok: false, error: 'قالب JSON انعطاف سررسید نامعتبر است' }
    }
  }
  if (typeof obj !== 'object' || obj === null) {
    return { ok: false, error: 'ساختار انعطاف سررسید نامعتبر است' }
  }
  const raw = obj as { default?: unknown; levels?: unknown }
  const config: FlexibilityConfig = { default: clampDays(raw.default), levels: [] }
  if (raw.default !== undefined) {
    const n = Number(raw.default)
    if (!Number.isFinite(n) || n < 0 || n > 90) {
      return { ok: false, error: 'روزهای انعطاف پیش‌فرض باید عددی بین ۰ تا ۹۰ باشد' }
    }
    config.default = Math.floor(n)
  }
  if (raw.levels === undefined || raw.levels === null) return { ok: true, config }
  if (!Array.isArray(raw.levels)) return { ok: false, error: 'فهرست سطوح انعطاف باید آرایه باشد' }
  if (raw.levels.length > 50) {
    return { ok: false, error: 'حداکثر ۵۰ سطح انعطاف قابل ثبت است' }
  }
  const seen = new Set<string>()
  for (const item of raw.levels) {
    if (typeof item !== 'object' || item === null) {
      return { ok: false, error: 'هر سطح انعطاف باید یک شیء باشد' }
    }
    const l = item as { scope?: unknown; key?: unknown; days?: unknown }
    const scope = String(l.scope ?? '')
    if (!FLEX_SCOPES.includes(scope as FlexScope)) {
      return { ok: false, error: `سطح ناشناخته: «${scope}» — سطوح مجاز: سال، فصل، ماه، هفته، روز` }
    }
    const key = String(l.key ?? '').trim()
    if (!KEY_PATTERNS[scope as FlexScope].test(key)) {
      return { ok: false, error: `کلید سطح «${FLEX_SCOPE_FA[scope as FlexScope]}» نامعتبر است: «${key}» — نمونهٔ درست: ${FLEX_KEY_EXAMPLES[scope as FlexScope]}` }
    }
    if (scope === 'DAY') {
      const [jy, jm, jd] = key.split('-').map(Number)
      if (jd > jalaliMonthLength(jy, jm)) {
        return { ok: false, error: `روز «${key}» در تقویم جلالی وجود ندارد` }
      }
    }
    const days = Number(l.days)
    if (!Number.isFinite(days) || days < 0 || days > 90) {
      return { ok: false, error: 'روزهای انعطاف هر سطح باید عددی بین ۰ تا ۹۰ باشد' }
    }
    const dedupeKey = `${scope}|${key}`
    if (seen.has(dedupeKey)) {
      return { ok: false, error: 'برای یک کلید، دو سطح تکراری ثبت شده است' }
    }
    seen.add(dedupeKey)
    config.levels.push({ scope: scope as FlexScope, key, days: Math.floor(days) })
  }
  return { ok: true, config }
}

export interface FlexResolution {
  days: number
  source: FlexScope | 'default'
  sourceFa: string
  /** Persian label of the matched level (empty for default) */
  keyLabel: string
}

/**
 * Effective flexibility for a date — most specific matching level wins:
 * DAY > WEEK > MONTH > SEASON > YEAR, else `default`.
 */
export function resolveFlex(config: FlexibilityConfig, date: Date): FlexResolution {
  // iterate from most specific to least specific
  const order: FlexScope[] = ['DAY', 'WEEK', 'MONTH', 'SEASON', 'YEAR']
  for (const scope of order) {
    const key = scopeKeyFor(scope, date)
    const level = config.levels.find((l) => l.scope === scope && l.key === key)
    if (level) {
      return { days: level.days, source: scope, sourceFa: FLEX_SCOPE_FA[scope], keyLabel: flexKeyLabelFa(level) }
    }
  }
  return { days: config.default, source: 'default', sourceFa: 'پیش‌فرض', keyLabel: '' }
}
