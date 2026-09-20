import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

/** GET /api/wall — team wall feed */
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()

  const posts = await db.wallPost.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
  const users = await db.user.findMany({ select: { id: true, name: true, color: true } })
  const userOf = (id: string) => users.find((u) => u.id === id)

  return Response.json(posts.map((p) => {
    const author = userOf(p.authorId)
    return {
      ...p,
      authorName: author?.name || 'کاربر حذف‌شده',
      authorColor: author?.color || '#5a7d4f',
    }
  }))
}

/** POST /api/wall — create post */
export async function POST(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()

  const body = await req.json().catch(() => null) as { content?: string } | null
  if (!body?.content?.trim()) {
    return Response.json({ error: 'متن پست خالی است' }, { status: 400 })
  }
  if (body.content.trim().length > 2000) {
    return Response.json({ error: 'متن پست خیلی بلند است (حداکثر ۲۰۰۰ کاراکتر)' }, { status: 400 })
  }

  const post = await db.wallPost.create({
    data: { content: body.content.trim(), authorId: session.id },
  })

  await logAudit(session.id, session.name, 'WALL_POST_CREATE', 'WALL_POST', post.id, {})
  return Response.json({ post: { ...post, authorName: session.name, authorColor: session.color } }, { status: 201 })
}
