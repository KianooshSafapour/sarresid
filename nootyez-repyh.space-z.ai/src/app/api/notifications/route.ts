import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/notifications?userId=&limit=30 → {notifications, unread}
export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams
    const userId = Number(sp.get('userId'))
    if (!userId) return NextResponse.json({ error: 'پارامتر userId الزامی است' }, { status: 400 })
    const limitRaw = Number(sp.get('limit'))
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 30, 1), 200)

    const [notifications, unread] = await Promise.all([
      db.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: limit }),
      db.notification.count({ where: { userId, readAt: null } }),
    ])
    return NextResponse.json({ notifications, unread })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

// PATCH /api/notifications {id} → mark one read  |  {all:true, userId} → mark all read
export async function PATCH(request: Request) {
  try {
    const b = await request.json()
    if (b?.all && b?.userId) {
      const res = await db.notification.updateMany({
        where: { userId: Number(b.userId), readAt: null },
        data: { readAt: new Date() },
      })
      return NextResponse.json({ count: res.count })
    }
    const id = Number(b?.id)
    if (!id) return NextResponse.json({ error: 'شناسه اعلان الزامی است' }, { status: 400 })
    const notification = await db.notification.update({ where: { id }, data: { readAt: new Date() } })
    return NextResponse.json({ notification })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}
