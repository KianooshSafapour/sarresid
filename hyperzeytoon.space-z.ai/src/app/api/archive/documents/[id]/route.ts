import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, logActivity } from '@/lib/server-utils'
import { hasRole } from '@/lib/auth'
import { toFaDigits } from '@/lib/jalali'

type Ctx = { params: Promise<{ id: string }> }

const DOC_TYPES = ['INVOICE', 'RECEIPT', 'CHEQUE', 'STATEMENT', 'CONTRACT', 'OTHER']

// PATCH /api/archive/documents/[id] — ویرایش سند / انتقال جیب یا بایندر (با ثبت جابه‌جایی)
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!hasRole(user, 'accountant')) return fail('اجازه ویرایش سند را ندارید', 403)
  const { id } = await ctx.params

  const doc = await db.archiveDocument.findUnique({
    where: { id },
    include: { binder: { select: { id: true, code: true } } },
  })
  if (!doc) return fail('سند یافت نشد', 404)

  const body = (await req.json()) as {
    binderId?: string
    pocket?: number
    docType?: string
    title?: string
    docDate?: string | null
    amount?: number | null
    providerId?: string | null
    orderId?: string | null
    chequeId?: string | null
    note?: string | null
  }

  const data: Record<string, unknown> = {}

  // —— انتقال بایندر / جیب ——
  const targetBinderId = body.binderId || doc.binderId
  let moved = false
  let moveDetail = ''
  if (body.binderId && body.binderId !== doc.binderId) {
    const target = await db.archiveBinder.findUnique({ where: { id: body.binderId } })
    if (!target) return fail('بایندر مقصد یافت نشد', 404)
    data.binderId = target.id
    moved = true
    moveDetail = `انتقال از ${doc.binder.code} به ${target.code}`
  }
  if (body.pocket !== undefined && body.pocket !== null) {
    const pocket = Number(body.pocket)
    if (!Number.isInteger(pocket) || pocket < 1) return fail('شماره جیب نامعتبر است')
    const target = await db.archiveBinder.findUnique({ where: { id: targetBinderId } })
    if (!target) return fail('بایندر مقصد یافت نشد', 404)
    if (pocket > target.capacity)
      return fail(`شماره جیب بیشتر از ظرفیت بایندر است (بیشینه ${toFaDigits(target.capacity)})`)
    const clash = await db.archiveDocument.findFirst({
      where: { binderId: targetBinderId, pocket, id: { not: id } },
      select: { id: true },
    })
    if (clash) return fail(`جیب ${toFaDigits(pocket)} بایندر مقصد اشغال است`, 409)
    if (pocket !== doc.pocket || data.binderId) {
      if (!moved) moveDetail = `جابه‌جایی جیب ${toFaDigits(doc.pocket)} ← ${toFaDigits(pocket)}`
      else moveDetail += ` — جیب ${toFaDigits(pocket)}`
      moved = true
    }
    data.pocket = pocket
  }

  if (body.docType !== undefined) {
    if (!DOC_TYPES.includes(body.docType)) return fail('نوع سند نامعتبر است')
    data.docType = body.docType
  }
  if (body.title !== undefined) {
    const t = body.title.trim()
    if (!t) return fail('عنوان سند نمی‌تواند خالی باشد')
    data.title = t
  }
  if (body.docDate !== undefined) data.docDate = body.docDate ? new Date(`${body.docDate}T00:00:00`) : null
  if (body.amount !== undefined)
    data.amount = body.amount !== null && Number(body.amount) > 0 ? Number(body.amount) : null
  if (body.providerId !== undefined) {
    if (body.providerId) {
      const prov = await db.provider.findUnique({ where: { id: body.providerId }, select: { id: true } })
      if (!prov) return fail('تأمین‌کننده یافت نشد', 404)
    }
    data.providerId = body.providerId || null
  }
  if (body.orderId !== undefined) data.orderId = body.orderId || null
  if (body.chequeId !== undefined) data.chequeId = body.chequeId || null
  if (body.note !== undefined) data.note = body.note?.trim() || null

  const updated = await db.archiveDocument.update({ where: { id }, data })

  if (moved)
    await logActivity(user.id, user.name, 'انتقال سند بایگانی', 'ArchiveDocument', id, `${moveDetail} — ${doc.title}`)
  else
    await logActivity(user.id, user.name, 'ویرایش سند بایگانی', 'ArchiveDocument', id, doc.title)

  return ok({ success: true, document: updated, moved })
}

// DELETE /api/archive/documents/[id] — حذف سند (فقط مدیران)
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!user.isManager) return fail('حذف سند تنها برای مدیران ممکن است', 403)
  const { id } = await ctx.params

  const doc = await db.archiveDocument.findUnique({ where: { id } })
  if (!doc) return fail('سند یافت نشد', 404)

  await db.archiveDocument.delete({ where: { id } })
  await logActivity(user.id, user.name, 'حذف سند بایگانی', 'ArchiveDocument', id, `${doc.binderId ? '' : ''}${doc.title}`)
  return ok({ success: true })
}
