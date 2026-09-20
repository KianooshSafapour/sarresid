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

async function awardPoints(userId: number, points: number, reason: string, awardedById?: number | null) {
  await db.pointsLog.create({ data: { userId, points, reason, awardedById: awardedById ?? null } })
  await db.user.update({ where: { id: userId }, data: { points: { increment: points } } })
}

// GET /api/wall → pinned first, then newest, limit 100, with author
export async function GET() {
  try {
    const posts = await db.wallPost.findMany({
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    })
    const users = await db.user.findMany({
      where: { id: { in: [...new Set(posts.map((p) => p.userId))] } },
      select: { id: true, name: true, color: true },
    })
    const umap = new Map(users.map((u) => [u.id, u]))
    return NextResponse.json({
      posts: posts.map((p) => ({ ...p, user: umap.get(p.userId) ?? null })),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

// POST /api/wall {userId, content} → +2 points to author
export async function POST(request: Request) {
  try {
    const b = await request.json()
    const userId = Number(b?.userId)
    const content = String(b?.content ?? '').trim()
    if (!userId) return NextResponse.json({ error: 'کاربر الزامی است' }, { status: 400 })
    if (!content) return NextResponse.json({ error: 'متن پست الزامی است' }, { status: 400 })

    const post = await db.wallPost.create({ data: { userId, content } })
    await awardPoints(userId, 2, 'اشتراک‌گذاری اطلاع در دیوار دیجیتال')
    await audit(userId, 'WALL_POST', 'WallPost', post.id, content.slice(0, 80))
    const author = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, color: true } })
    return NextResponse.json({ post: { ...post, user: author } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}

// PATCH /api/wall {id, pinned}
export async function PATCH(request: Request) {
  try {
    const b = await request.json()
    const id = Number(b?.id)
    if (!id) return NextResponse.json({ error: 'شناسه پست الزامی است' }, { status: 400 })
    const userId = b?.userId ? Number(b.userId) : null
    const post = await db.wallPost.update({
      where: { id },
      data: { pinned: Boolean(b?.pinned) },
    })
    await audit(userId, 'WALL_PIN', 'WallPost', id, `سنجاق: ${post.pinned ? 'بله' : 'خیر'} — ${post.content.slice(0, 60)}`)
    return NextResponse.json({ post })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}
