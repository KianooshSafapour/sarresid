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

// GET /api/ideas → with author, sorted desc
export async function GET() {
  try {
    const ideas = await db.idea.findMany({ orderBy: { createdAt: 'desc' } })
    const users = await db.user.findMany({
      where: { id: { in: [...new Set(ideas.map((i) => i.userId))] } },
      select: { id: true, name: true, color: true },
    })
    const umap = new Map(users.map((u) => [u.id, u]))
    return NextResponse.json({
      ideas: ideas.map((i) => ({ ...i, user: umap.get(i.userId) ?? null })),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

// POST /api/ideas {userId, title, content} → +3 points
export async function POST(request: Request) {
  try {
    const b = await request.json()
    const userId = Number(b?.userId)
    const title = String(b?.title ?? '').trim()
    const content = String(b?.content ?? '').trim()
    if (!userId) return NextResponse.json({ error: 'کاربر الزامی است' }, { status: 400 })
    if (!title || !content) return NextResponse.json({ error: 'عنوان و متن ایده الزامی است' }, { status: 400 })

    const idea = await db.idea.create({ data: { userId, title, content } })
    await awardPoints(userId, 3, 'ارسال ایده')
    await audit(userId, 'IDEA_SUBMIT', 'Idea', idea.id, title)
    const author = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, color: true } })
    return NextResponse.json({ idea: { ...idea, user: author } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}

// PATCH /api/ideas {id, status, decision?, decidedById}
// status: SUBMITTED | REVIEWING | ACCEPTED | IMPLEMENTED | REJECTED
export async function PATCH(request: Request) {
  try {
    const b = await request.json()
    const id = Number(b?.id)
    if (!id) return NextResponse.json({ error: 'شناسه ایده الزامی است' }, { status: 400 })
    const status = b?.status ? String(b.status) : null
    if (!status) return NextResponse.json({ error: 'وضعیت الزامی است' }, { status: 400 })
    const decidedById = b?.decidedById ? Number(b.decidedById) : null

    const existing = await db.idea.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'ایده یافت نشد' }, { status: 400 })

    // note: Idea model has no decidedById column — requester identity is kept in the audit log
    const idea = await db.idea.update({
      where: { id },
      data: {
        status,
        decision: b?.decision !== undefined ? (b.decision ? String(b.decision) : null) : existing.decision,
        decidedAt: new Date(),
      },
    })

    // award points only on transition (avoid double award)
    const firstTransition = existing.status !== status
    if (firstTransition && status === 'ACCEPTED')
      await awardPoints(idea.userId, 20, 'ایده پذیرفته شد', decidedById)
    if (firstTransition && status === 'IMPLEMENTED')
      await awardPoints(idea.userId, 50, 'ایده اجرا شد', decidedById)

    await db.notification.create({
      data: {
        userId: idea.userId,
        title: 'ایده شما پیگیری شد',
        body: `${idea.title} — وضعیت: ${status}`,
        type: status === 'REJECTED' ? 'WARNING' : 'SUCCESS',
      },
    })
    await audit(decidedById, 'IDEA_DECIDE', 'Idea', id, `${existing.status} → ${status}${idea.decision ? ` — ${idea.decision}` : ''}`)
    return NextResponse.json({ idea })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}
