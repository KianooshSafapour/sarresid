import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

type Params = { params: Promise<{ id: string }> }

const NOTE_COLORS = ['olive', 'gold', 'amber', 'rose']

/** PATCH /api/notes/[id] — edit own note only (strict privacy) */
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  const { id } = await params

  const note = await db.note.findUnique({ where: { id } })
  if (!note) return Response.json({ error: 'یادداشت یافت نشد' }, { status: 404 })
  if (note.userId !== session.id) {
    return Response.json({ error: 'این یادداشت خصوصی است و مال شما نیست' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as { content?: string; color?: string; pinned?: boolean } | null
  if (!body) return Response.json({ error: 'بدنه درخواست نامعتبر' }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (body.content !== undefined) {
    if (!body.content.trim()) return Response.json({ error: 'متن یادداشت نمی‌تواند خالی شود' }, { status: 400 })
    data.content = body.content.trim().slice(0, 5000)
  }
  if (body.color !== undefined && NOTE_COLORS.includes(body.color)) data.color = body.color
  if (body.pinned !== undefined) data.pinned = !!body.pinned

  if (Object.keys(data).length === 0) {
    return Response.json({ error: 'تغییری ارسال نشده' }, { status: 400 })
  }

  const updated = await db.note.update({ where: { id }, data })
  await logAudit(session.id, session.name, 'NOTE_UPDATE', 'NOTE', id, { keys: Object.keys(data) })
  return Response.json({ note: updated })
}

/** DELETE /api/notes/[id] — own note only */
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  const { id } = await params

  const note = await db.note.findUnique({ where: { id } })
  if (!note) return Response.json({ error: 'یادداشت یافت نشد' }, { status: 404 })
  if (note.userId !== session.id) {
    return Response.json({ error: 'این یادداشت خصوصی است و مال شما نیست' }, { status: 403 })
  }

  await db.note.delete({ where: { id } })
  await logAudit(session.id, session.name, 'NOTE_DELETE', 'NOTE', id, {})
  return Response.json({ ok: true })
}
