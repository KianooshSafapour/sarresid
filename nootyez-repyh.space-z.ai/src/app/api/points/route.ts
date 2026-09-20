import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

async function audit(
  userId: number | null | undefined,
  action: string,
  entity: string,
  entityId: number | null,
  detail?: string
) {
  let userName = 'سیستم'
  if (userId) {
    const u = await db.user.findUnique({ where: { id: userId }, select: { name: true } })
    if (u) userName = u.name
  }
  await db.auditLog.create({
    data: { userId: userId ?? 0, userName, action, entity, entityId, detail: detail ?? null },
  })
}

// GET /api/points?userId= → logs sorted desc limit 50
export async function GET(request: Request) {
  try {
    const userId = Number(new URL(request.url).searchParams.get('userId'))
    if (!userId) return NextResponse.json({ error: 'پارامتر userId الزامی است' }, { status: 400 })
    const logs = await db.pointsLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return NextResponse.json({ logs })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

// POST /api/points {userId, points, reason, awardedById?}
export async function POST(request: Request) {
  try {
    const b = await request.json()
    const userId = Number(b?.userId)
    const points = Number(b?.points)
    const reason = String(b?.reason ?? '').trim()
    const awardedById = b?.awardedById ? Number(b.awardedById) : null
    if (!userId) return NextResponse.json({ error: 'کاربر الزامی است' }, { status: 400 })
    if (!Number.isFinite(points) || points === 0)
      return NextResponse.json({ error: 'امتیاز باید عددی غیر صفر باشد' }, { status: 400 })
    if (!reason) return NextResponse.json({ error: 'دلیل امتیاز الزامی است' }, { status: 400 })

    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user) return NextResponse.json({ error: 'کاربر یافت نشد' }, { status: 400 })

    const log = await db.pointsLog.create({ data: { userId, points: Math.round(points), reason, awardedById } })
    await db.user.update({ where: { id: userId }, data: { points: { increment: Math.round(points) } } })
    await db.notification.create({
      data: {
        userId,
        title: 'امتیاز جدید',
        body: `${points > 0 ? '+' : ''}${Math.round(points)} امتیاز — ${reason}`,
        type: points > 0 ? 'SUCCESS' : 'WARNING',
      },
    })
    await audit(awardedById, 'POINTS_AWARD', 'PointsLog', log.id, `${user.name}: ${points > 0 ? '+' : ''}${Math.round(points)} — ${reason}`)
    return NextResponse.json({ log })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}
