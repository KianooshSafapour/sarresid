import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

/** GET /api/messages → my conversations with last message + unread count */
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()

  const convs = await db.conversation.findMany({
    where: { participantIds: { contains: `"${session.id}"` } },
    orderBy: { lastMessageAt: 'desc' },
  })

  type ConvRow = {
    id: string
    participants: { id: string; name: string; color: string; primaryRole: string }[]
    title: string
    lastMessage: { id: string; content: string; senderId: string; createdAt: Date } | null
    unread: number
    lastMessageAt: Date
  }
  const result: ConvRow[] = []
  for (const c of convs) {
    const participantIds: string[] = JSON.parse(c.participantIds)
    if (!participantIds.includes(session.id)) continue
    const others = participantIds.filter((p) => p !== session.id)
    const participants = await db.user.findMany({
      where: { id: { in: others } },
      select: { id: true, name: true, color: true, primaryRole: true },
    })
    const lastMessage = await db.message.findFirst({
      where: { conversationId: c.id },
      orderBy: { createdAt: 'desc' },
    })
    const incoming = await db.message.findMany({
      where: { conversationId: c.id, NOT: { senderId: session.id } },
      select: { readBy: true },
    })
    const unread = incoming.filter((m) => !JSON.parse(m.readBy).includes(session.id)).length
    result.push({
      id: c.id,
      participants,
      title: c.title || participants.map((p) => p.name).join('، '),
      lastMessage,
      unread,
      lastMessageAt: c.lastMessageAt,
    })
  }
  return Response.json(result)
}

/** POST /api/messages {userId} → get-or-create 1-to-1 conversation */
export async function POST(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  const body = await req.json()
  const otherIds: string[] = body.userIds || (body.userId ? [body.userId] : [])
  if (!otherIds.length) return Response.json({ error: 'انتخاب مخاطب الزامی است' }, { status: 400 })

  const participantIds = [...new Set([session.id, ...otherIds])]
  if (participantIds.length === 2) {
    const all = await db.conversation.findMany()
    for (const c of all) {
      const ids: string[] = JSON.parse(c.participantIds)
      if (ids.length === 2 && ids.includes(participantIds[0]) && ids.includes(participantIds[1])) {
        return Response.json({ id: c.id, created: false })
      }
    }
  }
  const conv = await db.conversation.create({
    data: { participantIds: JSON.stringify(participantIds) },
  })
  await logAudit(session.id, session.name, 'START_CONVERSATION', 'CONVERSATION', conv.id)
  return Response.json({ id: conv.id, created: true })
}
