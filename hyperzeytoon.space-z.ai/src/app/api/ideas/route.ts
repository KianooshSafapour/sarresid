import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, requireManager, fail, ok, logActivity, notify } from '@/lib/server-utils'

const WIN_STATUSES = ['ACCEPTED', 'IMPLEMENTED']

async function grantAward(userId: string, points: number, reason: string) {
  await db.award.create({ data: { userId, points, reason } })
  await db.user.update({ where: { id: userId }, data: { points: { increment: points } } })
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const ideas = await db.ideaPost.findMany({
    include: { author: { select: { name: true, color: true, title: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return ok({
    ideas: ideas.map((i) => ({
      id: i.id,
      title: i.title,
      content: i.content,
      status: i.status,
      rewardPoints: i.rewardPoints,
      adminNote: i.adminNote,
      createdAt: i.createdAt,
      mine: i.userId === user.id,
      authorName: i.author.name,
      authorColor: i.author.color,
    })),
  })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const body = (await req.json().catch(() => ({}))) as { title?: string; content?: string }
  if (!body.title?.trim() || !body.content?.trim()) return fail('عنوان و متن ایده الزامی است')
  const created = await db.ideaPost.create({
    data: { userId: user.id, title: body.title.trim(), content: body.content.trim() },
  })
  await logActivity(user.id, user.name, 'ثبت ایده', 'IdeaPost', created.id, created.title)
  return ok({ success: true, id: created.id })
}

export async function PATCH(req: NextRequest) {
  const user = await requireManager(req)
  if (!user) return fail('دسترسی غیرمجاز', 403)
  const body = (await req.json().catch(() => ({}))) as {
    id?: string
    status?: string
    rewardPoints?: number
    adminNote?: string
  }
  if (!body.id) return fail('شناسه الزامی است')
  const idea = await db.ideaPost.findUnique({ where: { id: body.id } })
  if (!idea) return fail('ایده یافت نشد', 404)

  const data: Record<string, unknown> = {}
  if (body.status && ['SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'IMPLEMENTED', 'REJECTED'].includes(body.status))
    data.status = body.status
  if (body.rewardPoints !== undefined) data.rewardPoints = Math.max(0, Math.round(body.rewardPoints))
  if (body.adminNote !== undefined) data.adminNote = body.adminNote?.trim() || null
  const updated = await db.ideaPost.update({ where: { id: idea.id }, data })

  // celebration moment: idea accepted / implemented → award + notify
  const becameWinner = !WIN_STATUSES.includes(idea.status) && WIN_STATUSES.includes(updated.status)
  if (becameWinner && updated.rewardPoints > 0) {
    await grantAward(updated.userId, updated.rewardPoints, `ایده برتر: ${updated.title}`)
  }
  if (becameWinner) {
    await notify(updated.userId, 'ایده شما پذیرفته شد 🎉', `${updated.title} — آفرین بر این فکر خلاقانه!`, 'SUCCESS', 'feedback')
  } else if (updated.userId !== user.id) {
    await notify(updated.userId, 'وضعیت ایده‌ات بروز شد', `${updated.title}`, 'INFO', 'feedback')
  }
  await logActivity(user.id, user.name, 'بررسی ایده', 'IdeaPost', idea.id, `${idea.title} → ${updated.status}`)
  return ok({ success: true })
}
