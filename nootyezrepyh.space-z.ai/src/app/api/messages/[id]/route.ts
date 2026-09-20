import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

async function loadConv(id: string) {
  return db.conversation.findUnique({ where: { id } })
}

/** GET /api/messages/[id] → messages (marks mine read) */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  const { id } = await params
  const conv = await loadConv(id)
  if (!conv) return Response.json({ error: 'گفتگو یافت نشد' }, { status: 404 })
  const participantIds: string[] = JSON.parse(conv.participantIds)
  if (!participantIds.includes(session.id)) return Response.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })

  const messages = await db.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: 'asc' },
    take: 200,
  })
  // mark incoming as read
  const toMark = messages.filter((m) => m.senderId !== session.id && !JSON.parse(m.readBy).includes(session.id))
  for (const m of toMark) {
    const readBy = JSON.parse(m.readBy)
    readBy.push(session.id)
    await db.message.update({ where: { id: m.id }, data: { readBy: JSON.stringify(readBy) } })
  }
  const others = participantIds.filter((p) => p !== session.id)
  const participants = await db.user.findMany({
    where: { id: { in: others } },
    select: { id: true, name: true, color: true, primaryRole: true },
  })
  return Response.json({ participants, messages })
}

/** POST /api/messages/[id] {content} → persist + return message (client relays via socket) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  const { id } = await params
  const conv = await loadConv(id)
  if (!conv) return Response.json({ error: 'گفتگو یافت نشد' }, { status: 404 })
  const participantIds: string[] = JSON.parse(conv.participantIds)
  if (!participantIds.includes(session.id)) return Response.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  const { content } = await req.json()
  if (!content?.trim()) return Response.json({ error: 'متن پیام خالی است' }, { status: 400 })

  const message = await db.message.create({
    data: {
      conversationId: id,
      senderId: session.id,
      content: String(content).slice(0, 4000),
      readBy: JSON.stringify([session.id]),
    },
  })
  await db.conversation.update({ where: { id }, data: { lastMessageAt: new Date() } })
  await logAudit(session.id, session.name, 'SEND_MESSAGE', 'CONVERSATION', id)

  return Response.json({
    id: message.id,
    conversationId: id,
    senderId: session.id,
    senderName: session.name,
    content: message.content,
    createdAt: message.createdAt,
    toUserIds: participantIds,
  })
}
