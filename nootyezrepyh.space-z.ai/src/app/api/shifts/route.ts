import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { canUser, PERMISSIONS } from '@/lib/constants'

/**
 * Weekly shift planner.
 * weekStart = Jalali date (YYYY/MM/DD) of the Saturday that starts the week.
 * day: 0=شنبه … 6=جمعه — type: MORNING | EVENING | NIGHT | OFF
 */

function validWeek(s: string | null): boolean {
  return !!s && /^\d{4}\/\d{2}\/\d{2}$/.test(s)
}

/** GET /api/shifts?week=YYYY/MM/DD — staff grid for one week */
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()

  const week = req.nextUrl.searchParams.get('week')
  if (!week || !/^\d{4}\/\d{2}\/\d{2}$/.test(week)) return Response.json({ error: 'هفته نامعتبر است' }, { status: 400 })

  const [shifts, users] = await Promise.all([
    db.shift.findMany({ where: { weekStart: week } }),
    db.user.findMany({
      where: { active: true },
      select: { id: true, name: true, color: true, primaryRole: true, roles: true, phone: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  return Response.json({ week, shifts, users })
}

/** PUT /api/shifts — bulk replace one week (MANAGE_SHIFTS) */
export async function PUT(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.MANAGE_SHIFTS)) {
    return Response.json({ error: 'اجازه ویرایش شیفت‌ها را ندارید' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as {
    week?: string
    entries?: { userId: string; day: number; type: string; note?: string }[]
  } | null

  if (!validWeek(body?.week || null)) return Response.json({ error: 'هفته نامعتبر است' }, { status: 400 })
  const week = body!.week!
  const entries = Array.isArray(body!.entries) ? body!.entries : []

  const TYPES = ['MORNING', 'EVENING', 'NIGHT', 'OFF']
  for (const e of entries) {
    if (!e.userId || !Number.isInteger(e.day) || e.day < 0 || e.day > 6 || !TYPES.includes(e.type)) {
      return Response.json({ error: 'داده شیفت نامعتبر است' }, { status: 400 })
    }
  }

  await db.$transaction([
    db.shift.deleteMany({ where: { weekStart: week } }),
    ...entries.map((e) =>
      db.shift.create({
        data: {
          userId: e.userId,
          weekStart: week,
          day: e.day,
          type: e.type,
          note: e.note?.slice(0, 200) || null,
          updatedById: session.id,
        },
      })
    ),
  ])

  const count = entries.length
  await logAudit(session.id, session.name, 'SHIFTS_SAVE', 'SHIFT', week, { week, count })

  return Response.json({ ok: true, count })
}
