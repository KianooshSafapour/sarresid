import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, requireManager, fail, ok, logActivity } from '@/lib/server-utils'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const { id } = await ctx.params
  const shelf = await db.shelf.findUnique({ where: { id } })
  if (!shelf) return fail('قفسه یافت نشد', 404)

  const body = (await req.json().catch(() => ({}))) as {
    name?: string
    section?: string
    row?: number
    col?: number
    productId?: string | null
    capacity?: number
    note?: string
    reportFilled?: boolean
  }

  const data: Record<string, unknown> = {}

  if (user.isManager) {
    if (body.name?.trim()) data.name = body.name.trim()
    if (body.section?.trim()) data.section = body.section.trim()
    if (body.row !== undefined) data.row = Math.max(1, Math.round(body.row))
    if (body.col !== undefined) data.col = Math.max(1, Math.round(body.col))
    if (body.productId !== undefined) data.productId = body.productId || null
    if (body.capacity !== undefined) data.capacity = Math.max(0, Math.round(body.capacity))
    if (body.note !== undefined) data.note = body.note?.trim() || null
  } else if (user.roleKeys.includes('merchandiser')) {
    // merchandiser can leave a filling note on the shelf (no stock mutation here)
    if (!body.reportFilled && body.note === undefined) return fail('دسترسی غیرمجاز', 403)
    if (body.note !== undefined) data.note = body.note?.trim() || null
    if (body.reportFilled) {
      data.note = body.note?.trim() || 'پر کردن قفسه گزارش شد ✅'
    }
  } else {
    return fail('دسترسی غیرمجاز', 403)
  }

  await db.shelf.update({ where: { id: shelf.id }, data })
  await logActivity(user.id, user.name, body.reportFilled ? 'گزارش پر کردن قفسه' : 'ویرایش قفسه', 'Shelf', shelf.id, shelf.name)
  return ok({ success: true })
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const user = await requireManager(req)
  if (!user) return fail('دسترسی غیرمجاز', 403)
  const { id } = await ctx.params
  const shelf = await db.shelf.findUnique({ where: { id } })
  if (!shelf) return fail('قفسه یافت نشد', 404)
  await db.shelf.delete({ where: { id } })
  await logActivity(user.id, user.name, 'حذف قفسه', 'Shelf', id, shelf.name)
  return ok({ success: true })
}
