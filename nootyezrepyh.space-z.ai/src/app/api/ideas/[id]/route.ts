import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { canUser, PERMISSIONS } from '@/lib/constants'

type Params = { params: Promise<{ id: string }> }

const VALID_STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'IMPLEMENTED', 'REJECTED']

/** PATCH /api/ideas/[id] — manager review: { status, rewardPoints }
 * awarding points creates an IDEA Activity + increments author points (server-side)
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.MANAGE_TASKS) && !canUser(session.roles, PERMISSIONS.AWARD_POINTS)) {
    return Response.json({ error: 'فقط مدیران می‌توانند ایده را بررسی کنند' }, { status: 403 })
  }
  const { id } = await params

  const idea = await db.idea.findUnique({ where: { id } })
  if (!idea) return Response.json({ error: 'ایده یافت نشد' }, { status: 404 })

  const body = await req.json().catch(() => null) as { status?: string; rewardPoints?: number } | null
  if (!body) return Response.json({ error: 'بدنه درخواست نامعتبر' }, { status: 400 })

  const data: Record<string, unknown> = {}
  let pointsAwarded = 0

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return Response.json({ error: 'وضعیت نامعتبر' }, { status: 400 })
    }
    data.status = body.status
    data.reviewedBy = session.name
  }

  // reward points — award only the positive delta vs. already-awarded points
  if (body.rewardPoints !== undefined) {
    const target = Math.max(0, Math.min(500, Math.round(Number(body.rewardPoints) || 0)))
    const delta = target - idea.rewardPoints
    data.rewardPoints = target
    if (delta > 0) {
      const awardable = ['ACCEPTED', 'IMPLEMENTED'].includes(String(data.status ?? idea.status))
      if (awardable) {
        pointsAwarded = delta
        const activity = await db.activity.create({
          data: {
            userId: idea.authorId,
            type: 'IDEA',
            title: `ایده نو: ${idea.title}`,
            points: delta,
            note: `برای ایده «${idea.title}»`,
            awardedById: session.id,
          },
        })
        await db.user.update({ where: { id: idea.authorId }, data: { points: { increment: delta } } })
        await logAudit(session.id, session.name, 'ACTIVITY_CREATE', 'ACTIVITY', activity.id, { type: 'IDEA', points: delta, ideaId: idea.id })
      }
    }
  }

  if (Object.keys(data).length === 0) {
    return Response.json({ error: 'تغییری ارسال نشده' }, { status: 400 })
  }

  const updated = await db.idea.update({ where: { id }, data })
  await logAudit(session.id, session.name, 'IDEA_REVIEW', 'IDEA', id, { keys: Object.keys(data), status: data.status, pointsAwarded })
  return Response.json({ idea: updated, pointsAwarded })
}
