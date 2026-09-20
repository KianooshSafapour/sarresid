import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { canUser, PERMISSIONS } from '@/lib/constants'

/** GET /api/ideas — my ideas (managers see all) */
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()

  const isManager = canUser(session.roles, PERMISSIONS.MANAGE_TASKS) || canUser(session.roles, PERMISSIONS.AWARD_POINTS)
  const ideas = await db.idea.findMany({
    where: isManager ? {} : { authorId: session.id },
    orderBy: { createdAt: 'desc' },
  })

  const users = await db.user.findMany({ select: { id: true, name: true } })
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name

  return Response.json(ideas.map((i) => ({
    ...i,
    authorName: nameOf(i.authorId) || i.authorId,
  })))
}

/** POST /api/ideas — submit idea */
export async function POST(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()

  const body = await req.json().catch(() => null) as { title?: string; content?: string } | null
  if (!body?.title?.trim() || !body.content?.trim()) {
    return Response.json({ error: 'عنوان و توضیح ایده الزامی است' }, { status: 400 })
  }

  const idea = await db.idea.create({
    data: {
      authorId: session.id,
      title: body.title.trim().slice(0, 200),
      content: body.content.trim().slice(0, 3000),
      status: 'SUBMITTED',
    },
  })

  await logAudit(session.id, session.name, 'IDEA_SUBMIT', 'IDEA', idea.id, { title: idea.title })
  return Response.json({ idea }, { status: 201 })
}
