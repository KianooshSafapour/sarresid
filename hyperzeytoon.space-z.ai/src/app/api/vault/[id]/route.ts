import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, logActivity } from '@/lib/server-utils'

// ============================================================
// ویرایش / حذف پرونده گنجینه شخصی — فقط برای مالک پرونده
// ============================================================

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const { id } = await ctx.params

  // STRICT: پرونده باید متعلق به خود کاربر باشد
  const file = await db.vaultFile.findFirst({ where: { id, userId: user.id } })
  if (!file) return fail('پرونده یافت نشد', 404)

  const body = (await req.json().catch(() => ({}))) as { name?: string; folder?: string; note?: string }

  const data: { name?: string; folder?: string; note?: string | null } = {}
  if (body.name !== undefined) {
    const name = body.name.trim()
    if (!name) return fail('نام پرونده نمی‌تواند خالی باشد')
    if (name.length > 120) return fail('نام پرونده حداکثر ۱۲۰ نویسه است')
    data.name = name
  }
  if (body.folder !== undefined) {
    const folder = body.folder.trim() || 'عمومی'
    if (folder.length > 60) return fail('نام پوشه حداکثر ۶۰ نویسه است')
    data.folder = folder
  }
  if (body.note !== undefined) {
    const note = body.note.trim()
    if (note.length > 1000) return fail('یادداشت حداکثر ۱۰۰۰ نویسه است')
    data.note = note || null
  }

  const updated = await db.vaultFile.update({ where: { id }, data })
  await logActivity(user.id, user.name, 'ویرایش پرونده گنجینه', 'VaultFile', id, updated.name)
  return ok({ success: true, file: updated })
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const { id } = await ctx.params

  // STRICT: پرونده باید متعلق به خود کاربر باشد
  const file = await db.vaultFile.findFirst({ where: { id, userId: user.id } })
  if (!file) return fail('پرونده یافت نشد', 404)

  await db.vaultFile.delete({ where: { id } })
  await logActivity(user.id, user.name, 'حذف پرونده گنجینه', 'VaultFile', id, file.name)
  return ok({ success: true })
}
