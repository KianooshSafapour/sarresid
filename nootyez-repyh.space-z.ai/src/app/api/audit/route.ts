import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/audit?limit=&entity=&userId=   |   ?stats=1
export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams

    if (sp.get('stats') === '1') {
      const byUser = await db.auditLog.groupBy({
        by: ['userName'],
        _count: { _all: true },
        orderBy: { _count: { userName: 'desc' } },
        take: 20,
      })
      const byEntity = await db.auditLog.groupBy({
        by: ['entity'],
        _count: { _all: true },
        orderBy: { _count: { entity: 'desc' } },
      })
      return NextResponse.json({
        stats: byUser.map((r) => ({ userName: r.userName, count: r._count._all })),
        entities: byEntity.map((r) => ({ entity: r.entity, count: r._count._all })),
      })
    }

    const limitRaw = Number(sp.get('limit'))
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 100, 1), 500)
    const entity = sp.get('entity')
    const userId = sp.get('userId') ? Number(sp.get('userId')) : null

    const logs = await db.auditLog.findMany({
      where: {
        ...(entity ? { entity } : {}),
        ...(userId ? { userId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    return NextResponse.json({ logs })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}
