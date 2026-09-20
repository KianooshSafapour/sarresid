import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { canUser, PERMISSIONS } from '@/lib/constants'

type Params = { params: Promise<{ id: string }> }

/** PATCH /api/wall/[id]
 * body: { like: true } → toggle like for session user
 * body: { pinned: boolean } → manager only pin/unpin
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  const { id } = await params

  const post = await db.wallPost.findUnique({ where: { id } })
  if (!post) return Response.json({ error: 'پست یافت نشد' }, { status: 404 })

  const body = await req.json().catch(() => null) as { like?: boolean; pinned?: boolean } | null
  if (!body) return Response.json({ error: 'بدنه درخواست نامعتبر' }, { status: 400 })

  const data: Record<string, unknown> = {}

  if (body.like === true) {
    let likes: string[] = []
    try {
      const arr = JSON.parse(post.likes)
      likes = Array.isArray(arr) ? arr.map(String) : []
    } catch { likes = [] }
    const next = likes.includes(session.id) ? likes.filter((x) => x !== session.id) : [...likes, session.id]
    data.likes = JSON.stringify(next)
  }

  if (body.pinned !== undefined) {
    if (!canUser(session.roles, PERMISSIONS.MANAGE_TASKS) && !canUser(session.roles, PERMISSIONS.AWARD_POINTS)) {
      return Response.json({ error: 'فقط مدیران می‌توانند پست را سنجاق کنند' }, { status: 403 })
    }
    data.pinned = !!body.pinned
  }

  if (Object.keys(data).length === 0) {
    return Response.json({ error: 'تغییری ارسال نشده' }, { status: 400 })
  }

  const updated = await db.wallPost.update({ where: { id }, data })
  await logAudit(session.id, session.name, body.pinned !== undefined ? 'WALL_PIN' : 'WALL_LIKE', 'WALL_POST', id, { likes: data.likes ? JSON.parse(data.likes as string).length : undefined, pinned: data.pinned })

  return Response.json({ post: updated })
}

/** DELETE /api/wall/[id] — author or manager */
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  const { id } = await params

  const post = await db.wallPost.findUnique({ where: { id } })
  if (!post) return Response.json({ error: 'پست یافت نشد' }, { status: 404 })

  const isManager = canUser(session.roles, PERMISSIONS.MANAGE_TASKS) || canUser(session.roles, PERMISSIONS.AWARD_POINTS)
  if (!isManager && post.authorId !== session.id) {
    return Response.json({ error: 'اجازه حذف این پست را ندارید' }, { status: 403 })
  }

  await db.wallPost.delete({ where: { id } })
  await logAudit(session.id, session.name, 'WALL_POST_DELETE', 'WALL_POST', id, { authorId: post.authorId })
  return Response.json({ ok: true })
}
