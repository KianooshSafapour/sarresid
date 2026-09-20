import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { canUser, PERMISSIONS } from '@/lib/constants'

const CATEGORIES = ['پلتفرم', 'گردش کار', 'محیط کار', 'سایر']

/** POST /api/feedback — anonymous feedback (no author stored) */
export async function POST(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()

  const body = await req.json().catch(() => null) as { content?: string; category?: string; rating?: number } | null
  if (!body?.content?.trim()) {
    return Response.json({ error: 'متن بازخورد خالی است' }, { status: 400 })
  }

  const rating = Math.min(5, Math.max(1, Math.round(Number(body.rating) || 0)))
  if (!rating) return Response.json({ error: 'امتیاز ستاره‌ای الزامی است' }, { status: 400 })

  const feedback = await db.feedback.create({
    data: {
      content: body.content.trim().slice(0, 3000),
      category: CATEGORIES.includes(body.category || '') ? body.category! : 'سایر',
      rating,
      status: 'NEW',
    },
  })

  // intentionally NOT logging user identity with the content — audit records only that a submission happened
  await logAudit(session.id, session.name, 'FEEDBACK_SUBMIT_ANONYMOUS', 'FEEDBACK', feedback.id, { rating })
  return Response.json({ ok: true }, { status: 201 })
}

/** GET /api/feedback — list all (managers only) */
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.MANAGE_TASKS) && !canUser(session.roles, PERMISSIONS.AWARD_POINTS)) {
    return Response.json({ error: 'فقط مدیران به بازخوردها دسترسی دارند' }, { status: 403 })
  }

  const items = await db.feedback.findMany({ orderBy: { createdAt: 'desc' } })
  return Response.json(items)
}

/** PATCH /api/feedback — manager updates status/response; body: { id, status, response? } */
export async function PATCH(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.MANAGE_TASKS) && !canUser(session.roles, PERMISSIONS.AWARD_POINTS)) {
    return Response.json({ error: 'فقط مدیران می‌توانند بازخورد را بررسی کنند' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as { id?: string; status?: string; response?: string } | null
  if (!body?.id) return Response.json({ error: 'شناسه بازخورد الزامی است' }, { status: 400 })

  const feedback = await db.feedback.findUnique({ where: { id: body.id } })
  if (!feedback) return Response.json({ error: 'بازخورد یافت نشد' }, { status: 404 })

  const data: Record<string, unknown> = {}
  if (body.status !== undefined) {
    if (!['NEW', 'REVIEWED', 'ACTIONED'].includes(body.status)) {
      return Response.json({ error: 'وضعیت نامعتبر' }, { status: 400 })
    }
    data.status = body.status
  }
  if (body.response !== undefined) data.response = body.response.trim() || null

  if (Object.keys(data).length === 0) {
    return Response.json({ error: 'تغییری ارسال نشده' }, { status: 400 })
  }

  const updated = await db.feedback.update({ where: { id: body.id }, data })
  await logAudit(session.id, session.name, 'FEEDBACK_REVIEW', 'FEEDBACK', body.id, { keys: Object.keys(data), status: data.status })
  return Response.json({ feedback: updated })
}
