import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, logActivity } from '@/lib/server-utils'

const FORBIDDEN_MSG = 'دسترسی به تحلیل‌های سامانه تنها برای مدیر ارشد سامانه مجاز است'

// ---------- POST: beacon ingest (never breaks UX — silently drops failures) ----------
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req)
    if (!user) return NextResponse.json({ success: false })
    const body = (await req.json().catch(() => null)) as
      | { events?: unknown[]; section?: unknown; action?: unknown; detail?: unknown; url?: unknown }
      | null
    if (!body) return NextResponse.json({ success: false })
    const rawEvents: unknown[] = Array.isArray(body.events)
      ? body.events
      : body.section
        ? [body]
        : []
    const rows = rawEvents
      .filter(
        (e): e is { section?: unknown; action?: unknown; detail?: unknown; url?: unknown } =>
          !!e && typeof e === 'object'
      )
      .filter((e) => typeof e.section === 'string' && (e.section as string).length > 0)
      .slice(0, 50)
      .map((e) => ({
        userId: user.id,
        userName: user.name,
        section: String(e.section).slice(0, 64),
        action: String(e.action ?? 'POST').slice(0, 32),
        detail:
          typeof e.detail === 'string'
            ? e.detail.slice(0, 255)
            : typeof e.url === 'string'
              ? e.url.slice(0, 255)
              : null,
      }))
    if (rows.length) await db.platformEvent.createMany({ data: rows })
    return NextResponse.json({ success: true, stored: rows.length })
  } catch {
    // analytics must never surface errors to the client
    return NextResponse.json({ success: false })
  }
}

// ---------- GET: root-admin only — events + summary facets ----------
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (user.isRoot !== true) return fail(FORBIDDEN_MSG, 403)

  const url = new URL(req.url)
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1)
  const pageSize = 50
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const section = url.searchParams.get('section')
  const q = url.searchParams.get('q')

  const where: {
    createdAt?: { gte?: Date; lte?: Date }
    section?: string
    OR?: { userName?: { contains: string }; section?: { contains: string }; action?: { contains: string }; detail?: { contains: string } }[]
  } = {}
  if (from || to) {
    where.createdAt = {}
    if (from && !isNaN(new Date(from).getTime())) where.createdAt.gte = new Date(from)
    if (to && !isNaN(new Date(to).getTime())) where.createdAt.lte = new Date(to)
  }
  if (section) where.section = section
  if (q) {
    where.OR = [
      { userName: { contains: q } },
      { section: { contains: q } },
      { action: { contains: q } },
      { detail: { contains: q } },
    ]
  }

  const [events, total, topSections, topUsers, dailyRaw] = await Promise.all([
    db.platformEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.platformEvent.count({ where }),
    db.platformEvent.groupBy({
      by: ['section'],
      _count: { section: true },
      orderBy: { _count: { section: 'desc' } },
      take: 8,
    }),
    db.platformEvent.groupBy({
      by: ['userName'],
      _count: { userName: true },
      orderBy: { _count: { userName: 'desc' } },
      take: 8,
    }),
    // Prisma stores SQLite DateTime as unix epoch milliseconds
    db.$queryRaw<{ day: string; count: bigint }[]>`
      SELECT date(createdAt / 1000, 'unixepoch') as day, COUNT(*) as count
      FROM PlatformEvent
      GROUP BY day
      ORDER BY day DESC
      LIMIT 14
    `,
  ])

  return ok({
    events: events.map((e) => ({
      id: e.id,
      userName: e.userName,
      section: e.section,
      action: e.action,
      detail: e.detail,
      createdAt: e.createdAt,
    })),
    total,
    page,
    pageSize,
    summary: {
      topSections: topSections.map((s) => ({ section: s.section, count: s._count.section })),
      topUsers: topUsers
        .filter((u) => u.userName)
        .map((u) => ({ userName: u.userName as string, count: u._count.userName })),
      dailyCounts: dailyRaw
        .map((d) => ({ day: d.day, count: Number(d.count) }))
        .reverse(), // ascending for charts
    },
  })
}

// ---------- DELETE: purge old events (root only) ----------
export async function DELETE(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (user.isRoot !== true) return fail(FORBIDDEN_MSG, 403)
  const beforeParam = new URL(req.url).searchParams.get('before')
  const cutoff = beforeParam ? new Date(beforeParam) : new Date(Date.now() - 90 * 24 * 3600 * 1000)
  if (isNaN(cutoff.getTime())) return fail('تاریخ «before» نامعتبر است')
  const res = await db.platformEvent.deleteMany({ where: { createdAt: { lt: cutoff } } })
  await logActivity(
    user.id,
    user.name,
    'پاک‌سازی تحلیل‌های سامانه',
    'PlatformEvent',
    undefined,
    `${res.count} رخداد قدیمی‌تر از ${cutoff.toISOString().slice(0, 10)} حذف شد`
  )
  return ok({ success: true, deleted: res.count })
}
