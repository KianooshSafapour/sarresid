import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { canUser, PERMISSIONS } from '@/lib/constants'

type Params = { params: Promise<{ id: string }> }

/** PATCH /api/sops/[id]
 * body: { view: true } → increments views counter (any logged-in user)
 * body: { title?, category?, content?, steps?, active? } → manager edit
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  const { id } = await params

  const sop = await db.sOP.findUnique({ where: { id } })
  if (!sop) return Response.json({ error: 'دستورالعمل یافت نشد' }, { status: 404 })

  const body = await req.json().catch(() => null) as {
    view?: boolean
    title?: string
    category?: string
    content?: string
    steps?: string[]
    active?: boolean
  } | null
  if (!body) return Response.json({ error: 'بدنه درخواست نامعتبر' }, { status: 400 })

  // view increment — open to everyone
  if (body.view === true) {
    const updated = await db.sOP.update({ where: { id }, data: { views: { increment: 1 } } })
    return Response.json({ ok: true, views: updated.views })
  }

  // edit — manager only
  if (!canUser(session.roles, PERMISSIONS.MANAGE_SOPS)) {
    return Response.json({ error: 'فقط مدیران می‌توانند دستورالعمل را ویرایش کنند' }, { status: 403 })
  }

  const data: Record<string, unknown> = {}
  if (body.title !== undefined && body.title.trim()) data.title = body.title.trim()
  if (body.category !== undefined && body.category.trim()) data.category = body.category.trim()
  if (body.content !== undefined) data.content = body.content.trim()
  if (body.steps !== undefined) {
    data.steps = Array.isArray(body.steps) && body.steps.length > 0
      ? JSON.stringify(body.steps.map((s) => String(s).trim()).filter(Boolean))
      : null
  }
  if (body.active !== undefined) data.active = !!body.active

  if (Object.keys(data).length === 0) {
    return Response.json({ error: 'تغییری ارسال نشده' }, { status: 400 })
  }

  const updated = await db.sOP.update({ where: { id }, data })
  await logAudit(session.id, session.name, 'SOP_UPDATE', 'SOP', id, { keys: Object.keys(data) })
  return Response.json({ sop: updated })
}

/** DELETE /api/sops/[id] — manager only */
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.MANAGE_SOPS)) {
    return Response.json({ error: 'فقط مدیران می‌توانند دستورالعمل را حذف کنند' }, { status: 403 })
  }
  const { id } = await params

  const sop = await db.sOP.findUnique({ where: { id } })
  if (!sop) return Response.json({ error: 'دستورالعمل یافت نشد' }, { status: 404 })

  await db.sOP.delete({ where: { id } })
  await logAudit(session.id, session.name, 'SOP_DELETE', 'SOP', id, { title: sop.title })
  return Response.json({ ok: true })
}
