import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok } from '@/lib/server-utils'
import { ensureChatBus } from '@/lib/chat-bus'

type Ctx = { params: Promise<{ id: string }> }

// Privacy model: single-tenant internal platform; auth via httpOnly cookie session.
// Only participants of a conversation can ever read or write its messages.
export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const { id } = await ctx.params
  const me = await db.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId: id, userId: user.id } },
  })
  if (!me) return fail('این گفتگو در دسترس شما نیست', 403)

  const url = new URL(req.url)
  const after = url.searchParams.get('after')
  // gte (not gt): two messages can share the same millisecond; client dedupes by id
  const where = after ? { conversationId: id, createdAt: { gte: new Date(after) } } : { conversationId: id }
  const messages = await db.message.findMany({
    where,
    include: { user: { select: { id: true, name: true, color: true } } },
    orderBy: { createdAt: 'asc' },
    take: 100,
  })
  // mark read — but only advance to the newest message we actually returned,
  // so a message is never silently swallowed and marked as seen
  const newest = messages.length ? messages[messages.length - 1].createdAt : null
  if (!after || newest) {
    await db.conversationParticipant.update({
      where: { id: me.id },
      data: { lastReadAt: newest ? new Date(newest) : new Date() },
    })
  }
  return ok({
    messages: messages.map((m) => ({
      id: m.id,
      content: m.content,
      createdAt: m.createdAt,
      mine: m.userId === user.id,
      userName: m.user.name,
      userColor: m.user.color,
    })),
    serverNow: new Date().toISOString(),
  })
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const { id } = await ctx.params
  const me = await db.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId: id, userId: user.id } },
  })
  if (!me) return fail('این گفتگو در دسترس شما نیست', 403)
  const body = (await req.json().catch(() => ({}))) as { content?: string }
  if (!body.content?.trim()) return fail('متن پیام خالی است')
  const created = await db.message.create({
    data: { conversationId: id, userId: user.id, content: body.content.trim() },
  })
  await db.conversation.update({ where: { id }, data: { updatedAt: new Date() } })
  await db.conversationParticipant.update({
    where: { id: me.id },
    data: { lastReadAt: new Date() },
  })

  // Realtime delivery bus — fire-and-forget, never blocks or fails the API.
  // Persistence already happened above (single writer = this API + SQLite);
  // the socket.io mini-service (:3003) only fans the message out instantly:
  //   'message' → room {conversationId}
  //   'conversation-activity' → every other participant (unread badge refresh)
  try {
    const rows = await db.conversationParticipant.findMany({
      where: { conversationId: id },
      select: { userId: true },
    })
    fetch('http://localhost:3003/emit', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hz-internal': '1' },
      body: JSON.stringify({
        conversationId: id,
        message: {
          id: created.id,
          conversationId: id,
          userId: user.id,
          userName: user.name,
          userColor: user.color,
          content: created.content,
          createdAt: created.createdAt,
        },
        participantIds: rows.map((r) => r.userId),
      }),
    }).catch(() => {})
  } catch {
    /* bus is optional — polling fallback keeps chat working without it */
  }

  return ok({
    success: true,
    message: {
      id: created.id,
      content: created.content,
      createdAt: created.createdAt,
      mine: true,
      userName: user.name,
      userColor: user.color,
    },
  })
}
