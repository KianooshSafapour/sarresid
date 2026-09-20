import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { canUser, PERMISSIONS, ACTIVITY_TYPES } from '@/lib/constants'

const PENDING_MARK = '⏳ در انتظار تأیید مدیر'
const VALID_TYPES = Object.keys(ACTIVITY_TYPES)

/** GET /api/activities?scope=mine|leaderboard|all
 * mine → my activity log; leaderboard → all active users sorted by points; all → every activity (manager)
 */
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()

  const scope = req.nextUrl.searchParams.get('scope') || 'mine'

  if (scope === 'leaderboard') {
    const users = await db.user.findMany({ where: { active: true }, orderBy: [{ points: 'desc' }, { name: 'asc' }] })
    return Response.json(users.map((u) => ({
      id: u.id,
      name: u.name,
      color: u.color,
      points: u.points,
      primaryRole: u.primaryRole,
      roles: JSON.parse(u.roles),
    })))
  }

  const users = await db.user.findMany({ select: { id: true, name: true, color: true } })
  const userOf = (id: string) => users.find((u) => u.id === id)

  if (scope === 'all') {
    if (!canUser(session.roles, PERMISSIONS.AWARD_POINTS)) {
      return Response.json({ error: 'فقط مدیران به کل فعالیت‌ها دسترسی دارند' }, { status: 403 })
    }
    const activities = await db.activity.findMany({ orderBy: { createdAt: 'desc' }, take: 200 })
    return Response.json(activities.map((a) => {
      const u = userOf(a.userId)
      const w = a.awardedById ? userOf(a.awardedById) : null
      return { ...a, userName: u?.name || a.userId, userColor: u?.color, awardedByName: w?.name || null }
    }))
  }

  // scope=mine
  const activities = await db.activity.findMany({
    where: { userId: session.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return Response.json(activities.map((a) => {
    const w = a.awardedById ? userOf(a.awardedById) : null
    return { ...a, awardedByName: w?.name || null }
  }))
}

/** POST /api/activities
 * body: { selfReport: true, type, note } → pending self-report (points 0)
 * body: { approveId, points } → manager approves pending self-report
 * body: { userId, type, points, note? } → manager award (AWARD_POINTS)
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()

  const body = await req.json().catch(() => null) as {
    selfReport?: boolean
    type?: string
    note?: string
    approveId?: string
    points?: number
    userId?: string
  } | null
  if (!body) return Response.json({ error: 'بدنه درخواست نامعتبر' }, { status: 400 })

  // ---- self report ----
  if (body.selfReport === true) {
    if (!body.type || !VALID_TYPES.includes(body.type)) {
      return Response.json({ error: 'نوع فعالیت نامعتبر است' }, { status: 400 })
    }
    if (!body.note?.trim()) {
      return Response.json({ error: 'توضیح کوتاه الزامی است' }, { status: 400 })
    }
    const t = ACTIVITY_TYPES[body.type]
    const activity = await db.activity.create({
      data: {
        userId: session.id,
        type: body.type,
        title: t.label,
        points: 0,
        note: `${PENDING_MARK} — ${body.note.trim().slice(0, 500)}`,
      },
    })
    await logAudit(session.id, session.name, 'ACTIVITY_SELF_REPORT', 'ACTIVITY', activity.id, { type: body.type })
    return Response.json({ activity }, { status: 201 })
  }

  // ---- approve pending self-report (manager) ----
  if (body.approveId) {
    if (!canUser(session.roles, PERMISSIONS.AWARD_POINTS)) {
      return Response.json({ error: 'فقط مدیران می‌توانند گزارش‌ها را تأیید کنند' }, { status: 403 })
    }
    const pending = await db.activity.findUnique({ where: { id: body.approveId } })
    if (!pending) return Response.json({ error: 'گزارش یافت نشد' }, { status: 404 })
    if (!pending.note?.startsWith(PENDING_MARK)) {
      return Response.json({ error: 'این گزارش قبلاً تأیید شده' }, { status: 400 })
    }

    const points = Math.max(0, Math.min(200, Math.round(Number(body.points) || 0)))
    const cleanNote = pending.note.replace(`${PENDING_MARK} — `, '')
    const updated = await db.activity.update({
      where: { id: pending.id },
      data: { points, note: cleanNote, awardedById: session.id },
    })
    if (points > 0) {
      await db.user.update({ where: { id: pending.userId }, data: { points: { increment: points } } })
    }
    await logAudit(session.id, session.name, 'ACTIVITY_APPROVE', 'ACTIVITY', pending.id, { points, userId: pending.userId, type: pending.type })
    return Response.json({ activity: updated, pointsAwarded: points })
  }

  // ---- manager award ----
  if (!canUser(session.roles, PERMISSIONS.AWARD_POINTS)) {
    return Response.json({ error: 'فقط مدیران می‌توانند امتیاز اعطا کنند' }, { status: 403 })
  }
  if (!body.userId || !body.type || !VALID_TYPES.includes(body.type)) {
    return Response.json({ error: 'همکار و نوع فعالیت را مشخص کنید' }, { status: 400 })
  }
  const target = await db.user.findUnique({ where: { id: body.userId } })
  if (!target || !target.active) {
    return Response.json({ error: 'همکار یافت نشد' }, { status: 404 })
  }

  const points = Math.max(0, Math.min(200, Math.round(Number(body.points) || 0)))
  const t = ACTIVITY_TYPES[body.type]
  const activity = await db.activity.create({
    data: {
      userId: target.id,
      type: body.type,
      title: t.label,
      points,
      note: body.note?.trim().slice(0, 500) || null,
      awardedById: session.id,
    },
  })
  if (points > 0) {
    await db.user.update({ where: { id: target.id }, data: { points: { increment: points } } })
  }
  await logAudit(session.id, session.name, 'ACTIVITY_AWARD', 'ACTIVITY', activity.id, { to: target.name, type: body.type, points })
  return Response.json({ activity }, { status: 201 })
}
