import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, requireManager, fail, ok, logActivity, notify } from '@/lib/server-utils'

async function grantAward(userId: string, points: number, reason: string, grantedById?: string) {
  await db.award.create({ data: { userId, points, reason, grantedById: grantedById ?? null } })
  await db.user.update({ where: { id: userId }, data: { points: { increment: points } } })
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')

  if (url.searchParams.get('leaderboard') === '1') {
    const top = await db.user.findMany({
      where: { active: true },
      orderBy: [{ points: 'desc' }, { name: 'asc' }],
      take: 50,
      include: {
        awards: { orderBy: { createdAt: 'desc' }, take: 3 },
      },
    })
    return ok({
      leaderboard: top.map((u, i) => ({
        rank: i + 1,
        id: u.id,
        name: u.name,
        title: u.title,
        color: u.color,
        points: u.points,
        recentAwards: u.awards.map((a) => ({ id: a.id, points: a.points, reason: a.reason, createdAt: a.createdAt })),
      })),
      me: { id: user.id, points: user.points },
    })
  }

  const targetId = userId || user.id
  const [awards, target] = await Promise.all([
    db.award.findMany({ where: { userId: targetId }, orderBy: { createdAt: 'desc' }, take: 60 }),
    db.user.findUnique({ where: { id: targetId }, select: { id: true, name: true, color: true, title: true, points: true } }),
  ])
  const ranked = await db.user.count({ where: { active: true, points: { gt: target?.points ?? 0 } } })
  return ok({ awards, user: target, rank: ranked + 1 })
}

export async function POST(req: NextRequest) {
  const user = await requireManager(req)
  if (!user) return fail('دسترسی غیرمجاز', 403)
  const body = (await req.json().catch(() => ({}))) as { userId?: string; points?: number; reason?: string }
  if (!body.userId || !body.points || !body.reason?.trim()) return fail('همکار، امتیاز و دلیل الزامی است')
  const target = await db.user.findUnique({ where: { id: body.userId } })
  if (!target) return fail('همکار یافت نشد', 404)

  await grantAward(target.id, Math.round(body.points), body.reason.trim(), user.id)
  await notify(target.id, 'امتیاز جدید دریافت کردید 🎉', `${body.reason.trim()} (+${Math.round(body.points)})`, 'SUCCESS', 'team')
  await logActivity(user.id, user.name, 'اعطای امتیاز', 'Award', target.id, `${target.name}: +${Math.round(body.points)} — ${body.reason.trim()}`)
  return ok({ success: true })
}
