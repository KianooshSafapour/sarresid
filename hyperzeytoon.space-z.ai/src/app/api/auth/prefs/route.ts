import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/server-utils'

// ---------------------------------------------------------------------------
// GET  /api/auth/prefs  → the signed-in user's saved appearance prefs
// PATCH /api/auth/prefs { prefs } → validate + persist to User.prefs (JSON)
// Kept deliberately minimal; this is the only file added under api/auth.
// ---------------------------------------------------------------------------

const THEMES = ['light', 'dark', 'system']
const ACCENTS = ['pistachio', 'saffron', 'pomegranate', 'copper', 'turquoise']
const DENSITIES = ['comfortable', 'compact']
const PATTERNS = ['boteh', 'paisley', 'plain']
const AVATAR_PATTERNS = ['boteh', 'girih', 'shamsa', 'cypress', 'olive', 'pistachio', 'jajim', 'khatam']
const AVATAR_PALETTES = ['emerald', 'pistachio', 'olive', 'saffron', 'copper', 'pomegranate', 'walnut', 'palm']

/** Whitelist validator — unknown keys dropped, wrong types fall back. */
function sanitize(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const p = input as Record<string, unknown>
  const out: Record<string, unknown> = {}

  out.theme = THEMES.includes(p.theme as string) ? p.theme : 'light'
  out.accent = ACCENTS.includes(p.accent as string) ? p.accent : 'pistachio'
  out.density = DENSITIES.includes(p.density as string) ? p.density : 'comfortable'
  out.pattern = PATTERNS.includes(p.pattern as string) ? p.pattern : 'boteh'

  const scale = typeof p.fontScale === 'number' && Number.isFinite(p.fontScale) ? p.fontScale : 1
  out.fontScale = Math.min(1.15, Math.max(0.9, Math.round(scale * 100) / 100))

  if (p.sidebarOrder && typeof p.sidebarOrder === 'object' && !Array.isArray(p.sidebarOrder)) {
    const order: Record<string, number> = {}
    for (const [k, v] of Object.entries(p.sidebarOrder as Record<string, unknown>)) {
      const n = Number(v)
      if (typeof k === 'string' && k.length <= 60 && Number.isFinite(n)) order[k] = Math.round(n)
    }
    if (Object.keys(order).length > 0) out.sidebarOrder = order
  }
  if (Array.isArray(p.sidebarHidden)) {
    const hidden = p.sidebarHidden.filter((x): x is string => typeof x === 'string' && x.length <= 60).slice(0, 40)
    if (hidden.length > 0) out.sidebarHidden = hidden
  }
  if (typeof p.locale === 'string' && p.locale.length <= 8) out.locale = p.locale

  // pinned avatar — explicit null means "back to automatic"
  if (p.avatar === null) {
    out.avatar = null
  } else if (p.avatar && typeof p.avatar === 'object' && !Array.isArray(p.avatar)) {
    const av = p.avatar as Record<string, unknown>
    if (AVATAR_PATTERNS.includes(av.pattern as string) && AVATAR_PALETTES.includes(av.palette as string)) {
      out.avatar = { pattern: av.pattern, palette: av.palette }
    }
  }

  return out
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  let prefs: unknown = null
  const row = await db.user.findUnique({ where: { id: user.id }, select: { prefs: true } })
  if (row?.prefs) {
    try {
      prefs = JSON.parse(row.prefs)
    } catch {
      prefs = null
    }
  }
  return NextResponse.json({ prefs })
}

export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 })
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'بدنه درخواست نامعتبر است' }, { status: 400 })
  }
  const prefs = sanitize((body as { prefs?: unknown })?.prefs)
  if (!prefs) return NextResponse.json({ error: 'تنظیمات ارسالی نامعتبر است' }, { status: 400 })

  // merge over the stored prefs: protects richer keys (sidebar layout, avatar)
  // from being wiped by a partial writer, while ordinary keys always win.
  let existing: Record<string, unknown> = {}
  const row = await db.user.findUnique({ where: { id: user.id }, select: { prefs: true } })
  if (row?.prefs) {
    try {
      const parsed = JSON.parse(row.prefs)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) existing = parsed
    } catch {
      existing = {}
    }
  }

  const merged: Record<string, unknown> = { ...existing, ...prefs }
  if (prefs.avatar === null) delete merged.avatar // explicit reset to automatic

  await db.user.update({ where: { id: user.id }, data: { prefs: JSON.stringify(merged) } })
  return NextResponse.json({ ok: true, prefs: merged })
}
