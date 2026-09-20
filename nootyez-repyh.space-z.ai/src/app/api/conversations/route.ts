import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/conversations?userId=
// → {conversations: [{id, other:{id,name,color}, lastMessage, lastAt, unread}]}
export async function GET(request: Request) {
  try {
    const userId = Number(new URL(request.url).searchParams.get('userId'))
    if (!userId) return NextResponse.json({ error: 'پارامتر userId الزامی است' }, { status: 400 })

    const convs = await db.conversation.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      include: { messages: { orderBy: { createdAt: 'desc' } } },
    })

    const otherIds = convs.map((c) => (c.userAId === userId ? c.userBId : c.userAId))
    const users = await db.user.findMany({
      where: { id: { in: otherIds } },
      select: { id: true, name: true, color: true },
    })
    const umap = new Map(users.map((u) => [u.id, u]))

    const conversations = convs
      .map((c) => {
        const otherId = c.userAId === userId ? c.userBId : c.userAId
        const last = c.messages[0]
        return {
          id: c.id,
          other: umap.get(otherId) ?? { id: otherId, name: 'کاربر', color: '#5F7A4E' },
          lastMessage: last?.content ?? '',
          lastAt: last?.createdAt ?? c.createdAt,
          unread: c.messages.filter((m) => m.senderId !== userId && !m.readAt).length,
        }
      })
      .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())

    return NextResponse.json({ conversations })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

// POST /api/conversations {userAId, userBId} → find or create → {conversation:{id}}
export async function POST(request: Request) {
  try {
    const b = await request.json()
    const a = Number(b?.userAId)
    const c = Number(b?.userBId)
    if (!a || !c) return NextResponse.json({ error: 'هر دو کاربر الزامی است' }, { status: 400 })
    if (a === c) return NextResponse.json({ error: 'گفتگو با خودش ممکن نیست' }, { status: 400 })

    const existing = await db.conversation.findFirst({
      where: {
        OR: [
          { userAId: a, userBId: c },
          { userAId: c, userBId: a },
        ],
      },
    })
    if (existing) return NextResponse.json({ conversation: { id: existing.id } })
    const conv = await db.conversation.create({ data: { userAId: a, userBId: c } })
    return NextResponse.json({ conversation: { id: conv.id } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}
