import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, requireManager, fail, ok, logActivity, notify } from '@/lib/server-utils'

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const feedback = await db.feedbackPost.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  // FeedbackPost has no direct relation in the schema — resolve known authors manually
  const authorIds = Array.from(
    new Set(feedback.filter((f) => !f.anonymous && f.userId).map((f) => f.userId as string))
  )
  const authors = authorIds.length
    ? await db.user.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, name: true, color: true, title: true },
      })
    : []
  const visible = user.isManager
    ? feedback
    : feedback.filter((f) => !f.anonymous && f.userId === user.id)
  return ok({
    feedback: visible.map((f) => {
      const author = f.userId ? authors.find((a) => a.id === f.userId) : null
      return {
        id: f.id,
        content: f.content,
        rating: f.rating,
        anonymous: f.anonymous,
        status: f.status,
        adminReply: f.adminReply,
        createdAt: f.createdAt,
        authorName: f.anonymous || !author ? null : author.name,
        authorColor: f.anonymous || !author ? null : author.color,
        authorTitle: f.anonymous || !author ? null : author.title,
      }
    }),
  })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const body = (await req.json().catch(() => ({}))) as { content?: string; rating?: number; anonymous?: boolean }
  if (!body.content?.trim()) return fail('متن نظر الزامی است')
  const anonymous = body.anonymous ?? true
  const created = await db.feedbackPost.create({
    data: {
      content: body.content.trim(),
      rating: body.rating ? Math.min(5, Math.max(1, Math.round(body.rating))) : null,
      anonymous,
      // privacy promise: when anonymous, we never store who wrote it
      userId: anonymous ? null : user.id,
    },
  })
  await logActivity(user.id, user.name, anonymous ? 'ثبت نظر مخفیانه' : 'ثبت بازخورد', 'FeedbackPost', created.id)
  return ok({ success: true, id: created.id })
}

export async function PATCH(req: NextRequest) {
  const user = await requireManager(req)
  if (!user) return fail('دسترسی غیرمجاز', 403)
  const body = (await req.json().catch(() => ({}))) as { id?: string; status?: string; adminReply?: string }
  if (!body.id) return fail('شناسه الزامی است')
  const fb = await db.feedbackPost.findUnique({ where: { id: body.id } })
  if (!fb) return fail('بازخورد یافت نشد', 404)

  const data: Record<string, unknown> = {}
  if (body.status && ['NEW', 'REVIEWED', 'ACTIONED'].includes(body.status)) data.status = body.status
  if (body.adminReply !== undefined) data.adminReply = body.adminReply?.trim() || null
  await db.feedbackPost.update({ where: { id: fb.id }, data })

  // reply only reaches a known author (anonymous feedback stays anonymous)
  if (!fb.anonymous && fb.userId && (body.adminReply || body.status)) {
    await notify(
      fb.userId,
      'بازخوردت بررسی شد 🌿',
      body.adminReply?.trim() || 'از اینکه نظرت را گفتیم متشکریم',
      'SUCCESS',
      'feedback'
    )
  }
  await logActivity(user.id, user.name, 'بررسی بازخورد', 'FeedbackPost', fb.id, body.status)
  return ok({ success: true })
}
