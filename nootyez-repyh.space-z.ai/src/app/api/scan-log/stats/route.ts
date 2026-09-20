import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/scan-log/stats?days=7&userId=<viewer>
 *
 * Scan-adoption mini stats for managers (scan chip in the delivery ScanBar).
 * Role-gated: GENERAL_MANAGER | OPERATION_MANAGER | IT_ADMIN | OWNER → 200,
 * everyone else (including missing/unknown userId) → 403.
 *
 * Reads AuditLog action='SCAN_IN' from the last N days (local days, today
 * included) and reduces in JS — audit volume is small. NO audits are written
 * by this GET handler. Response:
 *   { total, hits, closed, issues (miss+warn+error), bySource {manual,camera},
 *     byDay: [{dayISO, count}] ascending, zero days included,
 *     perUser: [{userName, total, hits}] — SCAN_IN rows grouped by the audit
 *     userName column; hits = successful scans (outcome hit|closed, same
 *     definition as the chip's «موفق»); sorted total desc, top 8 }
 */

const MANAGER_ROLES = ['GENERAL_MANAGER', 'OPERATION_MANAGER', 'IT_ADMIN', 'OWNER']
const FORBIDDEN = { error: 'دسترسی به آمار اسکن برای نقش شما مجاز نیست | Forbidden' }

/** machine marker written by POST /api/scan-log: ` | scan=<outcome>,<source>` */
function parseMarker(detail: string | null | undefined): { outcome: string; source: string } | null {
  const m = /\| scan=([a-z]+),([a-z]+)/.exec(detail ?? '')
  return m ? { outcome: m[1], source: m[2] } : null
}

/** fallback for rows without the marker: parse the Persian labels */
const FA_OUTCOME: Record<string, string> = {
  'موفق': 'hit',
  'بسته': 'closed',
  'بدون تحویل': 'warn',
  'یافت نشد': 'miss',
  'خطا': 'error',
}

function parseFa(detail: string | null | undefined): { outcome: string; source: string } | null {
  const d = detail ?? ''
  const src = /— منبع: (دوربین|دستی)/.exec(d)
  const out = /— نتیجه: (موفق|بسته|بدون تحویل|یافت نشد|خطا)/.exec(d)
  if (!src && !out) return null
  return {
    outcome: (out && FA_OUTCOME[out[1]]) || 'warn',
    source: src ? (src[1] === 'دوربین' ? 'camera' : 'manual') : 'manual',
  }
}

const pad2 = (n: number) => String(n).padStart(2, '0')
/** server-local calendar day (same convention as /api/dashboard day buckets) */
const localISO = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams
  const userId = Number(sp.get('userId'))
  if (!Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json(FORBIDDEN, { status: 403 })
  }

  let user: { active: boolean; roles: string } | null = null
  try {
    user = await db.user.findUnique({ where: { id: userId }, select: { active: true, roles: true } })
  } catch {
    user = null
  }
  if (!user || !user.active) {
    return NextResponse.json(FORBIDDEN, { status: 403 })
  }
  const roles = user.roles.split(',').map((r) => r.trim())
  if (!roles.some((r) => MANAGER_ROLES.includes(r))) {
    return NextResponse.json(FORBIDDEN, { status: 403 })
  }

  const daysRaw = Number(sp.get('days'))
  const days = Math.min(Math.max(Number.isFinite(daysRaw) && daysRaw > 0 ? Math.floor(daysRaw) : 7, 1), 90)

  try {
    const since = new Date()
    since.setHours(0, 0, 0, 0)
    since.setDate(since.getDate() - (days - 1)) // start of N days ago — today included

    const rows = await db.auditLog.findMany({
      where: { action: 'SCAN_IN', createdAt: { gte: since } },
      select: { detail: true, createdAt: true, userName: true },
      orderBy: { createdAt: 'asc' },
    })

    let hits = 0
    let closed = 0
    let issues = 0
    let manual = 0
    let camera = 0

    // pre-seed every day of the window (zeros included) so the sparkline gets N bars
    const byDay: { dayISO: string; count: number }[] = []
    const dayIndex = new Map<string, number>()
    for (let i = 0; i < days; i++) {
      const d = new Date(since)
      d.setDate(since.getDate() + i)
      dayIndex.set(localISO(d), byDay.length)
      byDay.push({ dayISO: localISO(d), count: 0 })
    }

    // per-user leaderboard source: group by the audit's userName column
    // (written by POST /api/scan-log from the submitting user's session)
    const perUserMap = new Map<string, { userName: string; total: number; hits: number }>()

    for (const r of rows) {
      const p = parseMarker(r.detail) ?? parseFa(r.detail) ?? null
      if (p?.outcome === 'hit') hits++
      else if (p?.outcome === 'closed') closed++
      else issues++ // warn | miss | error (and unparseable rows)
      if (p?.source === 'camera') camera++
      else manual++
      const idx = dayIndex.get(localISO(r.createdAt))
      if (idx !== undefined) byDay[idx].count++

      const name = (r.userName ?? '').trim() || '—'
      let u = perUserMap.get(name)
      if (!u) {
        u = { userName: name, total: 0, hits: 0 }
        perUserMap.set(name, u)
      }
      u.total++
      if (p?.outcome === 'hit' || p?.outcome === 'closed') u.hits++
    }

    const perUser = [...perUserMap.values()]
      .sort((a, b) => b.total - a.total || b.hits - a.hits)
      .slice(0, 8)

    return NextResponse.json({
      total: rows.length,
      hits,
      closed,
      issues,
      bySource: { manual, camera },
      byDay,
      perUser,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'error' },
      { status: 500 },
    )
  }
}
