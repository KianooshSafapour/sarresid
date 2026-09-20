import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, logActivity } from '@/lib/server-utils'
import { ensureChatBus } from '@/lib/chat-bus'

export async function GET(req: NextRequest) {
  void ensureChatBus() // best-effort: boot the realtime bus if it is down
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const convs = await db.conversation.findMany({
    where: { participants: { some: { userId: user.id } } },
    include: {
      participants: { include: { user: { select: { id: true, name: true, color: true, title: true } } } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { updatedAt: 'desc' },
    take: 60,
  })

  // unread count per conversation: messages newer than my lastReadAt, not written by me
  const unreadCounts = await Promise.all(
    convs.map(async (c) => {
      const mine = c.participants.find((p) => p.userId === user.id)
      const since = mine?.lastReadAt ?? c.createdAt
      return db.message.count({
        where: { conversationId: c.id, createdAt: { gt: since }, userId: { not: user.id } },
      })
    })
  )

  return ok({
    conversations: convs.map((c, idx) => {
      const others = c.participants.filter((p) => p.userId !== user.id)
      const last = c.messages[0]
      return {
        id: c.id,
        isGroup: c.isGroup,
        title: c.isGroup ? c.title : others[0]?.user.name ?? 'گفتگو',
        participants: c.participants.map((p) => ({
          id: p.user.id,
          name: p.user.name,
          color: p.user.color,
          title: p.user.title,
        })),
        lastMessage: last ? { content: last.content, createdAt: last.createdAt, mine: last.userId === user.id } : null,
        unreadCount: unreadCounts[idx],
        updatedAt: c.updatedAt,
      }
    }),
  })
}

export async function POST(req: NextRequest) {
  void ensureChatBus()
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const body = (await req.json().catch(() => ({}))) as { userId?: string; title?: string; userIds?: string[] }

  // DM: find-or-create a 1:1 conversation
  if (body.userId) {
    if (body.userId === user.id) return fail('گفتگو با خودت لازم نیست 🙂')
    const target = await db.user.findUnique({ where: { id: body.userId } })
    if (!target) return fail('همکار یافت نشد', 404)

    const candidates = await db.conversation.findMany({
      where: {
        isGroup: false,
        AND: [
          { participants: { some: { userId: user.id } } },
          { participants: { some: { userId: body.userId } } },
        ],
      },
      include: { participants: true },
    })
    const dm = candidates.find((c) => c.participants.length === 2)
    if (dm) return ok({ success: true, id: dm.id, existing: true })

    const created = await db.conversation.create({
      data: {
        isGroup: false,
        participants: { create: [{ userId: user.id }, { userId: body.userId }] },
      },
    })
    await logActivity(user.id, user.name, 'شروع گفتگو', 'Conversation', created.id, target.name)
    return ok({ success: true, id: created.id, existing: false })
  }

  // group chat (managers)
  if (!user.isManager) return fail('ایجاد گروه فقط برای مدیران ممکن است', 403)
  const memberIds = Array.from(new Set((body.userIds ?? []).filter((id) => id !== user.id)))
  if (memberIds.length < 2) return fail('برای گروه حداقل دو همکار را انتخاب کنید')
  const created = await db.conversation.create({
    data: {
      isGroup: true,
      title: body.title?.trim() || 'گروه کاری',
      participants: { create: [...memberIds, user.id].map((userId) => ({ userId })) },
    },
  })
  await logActivity(user.id, user.name, 'ایجاد گروه گفتگو', 'Conversation', created.id, created.title ?? undefined)
  return ok({ success: true, id: created.id })
}
