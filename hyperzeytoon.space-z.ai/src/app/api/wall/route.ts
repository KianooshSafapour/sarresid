import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, requireManager, fail, ok, logActivity, notify } from '@/lib/server-utils'

const WALL_AWARD_REASON = 'مشارکت در دیوار همکاری'
const WALL_AWARD_COOLDOWN_MS = 3 * 60 * 60 * 1000 // once per 3 hours

async function grantAward(userId: string, points: number, reason: string) {
  await db.award.create({ data: { userId, points, reason } })
  await db.user.update({ where: { id: userId }, data: { points: { increment: points } } })
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const posts = await db.wallPost.findMany({
    include: { author: { select: { id: true, name: true, color: true, title: true } } },
    orderBy: [{ createdAt: 'desc' }],
    take: 50,
  })
  // pinned first, then newest
  const sorted = [...posts].sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1))
  return ok({ posts: sorted })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const body = (await req.json().catch(() => ({}))) as { content?: string; category?: string }
  if (!body.content?.trim()) return fail('متن پیام الزامی است')
  const category = ['INFO', 'WARNING', 'EVENT', 'TIP'].includes(body.category ?? '') ? body.category! : 'INFO'

  const created = await db.wallPost.create({
    data: { userId: user.id, content: body.content.trim(), category },
    include: { author: { select: { id: true, name: true, color: true, title: true } } },
  })

  // +1 point, max once per 3h
  const lastAward = await db.award.findFirst({
    where: { userId: user.id, reason: WALL_AWARD_REASON },
    orderBy: { createdAt: 'desc' },
  })
  let awarded = false
  if (!lastAward || Date.now() - new Date(lastAward.createdAt).getTime() > WALL_AWARD_COOLDOWN_MS) {
    await grantAward(user.id, 1, WALL_AWARD_REASON)
    await notify(user.id, 'آفرین! +۱ امتیاز ⭐', 'به خاطر مشارکت در دیوار همکاری', 'SUCCESS', 'wall')
    awarded = true
  }
  await logActivity(user.id, user.name, 'ثبت دیوار همکاری', 'WallPost', created.id, category)
  return ok({ success: true, id: created.id, post: created, awarded })
}

export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const body = (await req.json().catch(() => ({}))) as { id?: string; pinned?: boolean; likes?: 'inc' }
  if (!body.id) return fail('شناسه الزامی است')
  const post = await db.wallPost.findUnique({ where: { id: body.id } })
  if (!post) return fail('پست یافت نشد', 404)

  const data: Record<string, unknown> = {}
  if (body.pinned !== undefined) {
    if (!user.isManager) return fail('سنجاق کردن فقط برای مدیران ممکن است', 403)
    data.pinned = body.pinned
  }
  if (body.likes === 'inc') data.likes = { increment: 1 }

  await db.wallPost.update({ where: { id: post.id }, data })
  if (body.pinned !== undefined) {
    await logActivity(user.id, user.name, body.pinned ? 'سنجاق پست دیوار' : 'برداشتن سنجاق', 'WallPost', post.id)
  }
  return ok({ success: true })
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return fail('شناسه الزامی است')
  const post = await db.wallPost.findUnique({ where: { id } })
  if (!post) return fail('پست یافت نشد', 404)
  if (post.userId !== user.id && !user.isManager) return fail('دسترسی غیرمجاز', 403)
  await db.wallPost.delete({ where: { id } })
  await logActivity(user.id, user.name, 'حذف پست دیوار', 'WallPost', id)
  return ok({ success: true })
}
