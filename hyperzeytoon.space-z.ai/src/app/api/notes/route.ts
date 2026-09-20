import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, logActivity } from '@/lib/server-utils'

// Privacy-critical: personal notes are ONLY visible to their owner.
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const notes = await db.personalNote.findMany({
    where: { userId: user.id },
    orderBy: [{ updatedAt: 'desc' }],
  })
  const sorted = [...notes].sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1))
  return ok({ notes: sorted })
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const body = (await req.json().catch(() => ({}))) as {
    title?: string
    content?: string
    color?: string
    pinned?: boolean
  }
  if (!body.title?.trim()) return fail('عنوان یادداشت الزامی است')
  const created = await db.personalNote.create({
    data: {
      userId: user.id,
      title: body.title.trim(),
      content: body.content?.trim() || null,
      color: body.color || '#C9A227',
      pinned: body.pinned ?? false,
    },
  })
  await logActivity(user.id, user.name, 'ثبت یادداشت شخصی', 'PersonalNote', created.id)
  return ok({ success: true, id: created.id })
}

export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const body = (await req.json().catch(() => ({}))) as {
    id?: string
    title?: string
    content?: string
    color?: string
    pinned?: boolean
  }
  if (!body.id) return fail('شناسه الزامی است')
  const note = await db.personalNote.findUnique({ where: { id: body.id } })
  if (!note) return fail('یادداشت یافت نشد', 404)
  if (note.userId !== user.id) return fail('فقط خودت به یادداشت‌هایت دسترسی داری', 403)

  const data: Record<string, unknown> = {}
  if (body.title?.trim()) data.title = body.title.trim()
  if (body.content !== undefined) data.content = body.content?.trim() || null
  if (body.color) data.color = body.color
  if (body.pinned !== undefined) data.pinned = body.pinned
  await db.personalNote.update({ where: { id: note.id }, data })
  await logActivity(user.id, user.name, 'ویرایش یادداشت شخصی', 'PersonalNote', note.id)
  return ok({ success: true })
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return fail('شناسه الزامی است')
  const note = await db.personalNote.findUnique({ where: { id } })
  if (!note) return fail('یادداشت یافت نشد', 404)
  if (note.userId !== user.id) return fail('فقط خودت به یادداشت‌هایت دسترسی داری', 403)
  await db.personalNote.delete({ where: { id } })
  await logActivity(user.id, user.name, 'حذف یادداشت شخصی', 'PersonalNote', id)
  return ok({ success: true })
}
