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

// GET /api/messages?conversationId=&userId=
// → messages asc; also marks messages not-from-user as read (readAt = now)
export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams
    const conversationId = Number(sp.get('conversationId'))
    const userId = Number(sp.get('userId'))
    if (!conversationId || !userId)
      return NextResponse.json({ error: 'conversationId و userId الزامی است' }, { status: 400 })

    await db.message.updateMany({
      where: { conversationId, senderId: { not: userId }, readAt: null },
      data: { readAt: new Date() },
    })
    const messages = await db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json({ messages })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

// POST /api/messages {conversationId, senderId, content}
export async function POST(request: Request) {
  try {
    const b = await request.json()
    const conversationId = Number(b?.conversationId)
    const senderId = Number(b?.senderId)
    const content = String(b?.content ?? '').trim()
    if (!conversationId || !senderId)
      return NextResponse.json({ error: 'گفتگو و فرستنده الزامی است' }, { status: 400 })
    if (!content) return NextResponse.json({ error: 'متن پیام الزامی است' }, { status: 400 })

    const conv = await db.conversation.findUnique({ where: { id: conversationId } })
    if (!conv) return NextResponse.json({ error: 'گفتگو یافت نشد' }, { status: 400 })

    const message = await db.message.create({ data: { conversationId, senderId, content } })

    // notify the other participant
    const otherId = conv.userAId === senderId ? conv.userBId : conv.userAId
    await db.notification.create({
      data: { userId: otherId, title: 'پیام جدید', body: content.slice(0, 60), type: 'INFO' },
    })
    await audit(senderId, 'MESSAGE_SEND', 'Message', message.id, content.slice(0, 80))

    return NextResponse.json({ message })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}

// PATCH /api/messages {conversationId, userId} → mark all read
export async function PATCH(request: Request) {
  try {
    const b = await request.json()
    const conversationId = Number(b?.conversationId)
    const userId = Number(b?.userId)
    if (!conversationId || !userId)
      return NextResponse.json({ error: 'conversationId و userId الزامی است' }, { status: 400 })
    const res = await db.message.updateMany({
      where: { conversationId, senderId: { not: userId }, readAt: null },
      data: { readAt: new Date() },
    })
    return NextResponse.json({ count: res.count })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}
