import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, logActivity } from '@/lib/server-utils'
import { hasRole } from '@/lib/auth'
import { toFaDigits } from '@/lib/jalali'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/archive/binders/[id] — بایندر + اسناد مرتب بر پایه شماره جیب
export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const { id } = await ctx.params

  const binder = await db.archiveBinder.findUnique({
    where: { id },
    include: {
      documents: {
        include: { provider: { select: { name: true, color: true } } },
        orderBy: [{ pocket: 'asc' }, { createdAt: 'asc' }],
      },
    },
  })
  if (!binder) return fail('بایندر یافت نشد', 404)

  // نام ثبت‌کننده‌ها (بدون رابطه مستقیم)
  const userIds = Array.from(new Set(binder.documents.map((d) => d.createdById).filter(Boolean))) as string[]
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, color: true } })
    : []
  const userById = new Map(users.map((u) => [u.id, u]))

  return ok({
    binder: {
      ...binder,
      documents: binder.documents.map((d) => ({
        id: d.id,
        pocket: d.pocket,
        docType: d.docType,
        title: d.title,
        docDate: d.docDate,
        amount: d.amount,
        providerId: d.providerId,
        providerName: d.provider?.name ?? null,
        providerColor: d.provider?.color ?? null,
        orderId: d.orderId,
        chequeId: d.chequeId,
        note: d.note,
        createdByName: (d.createdById ? userById.get(d.createdById)?.name : null) ?? null,
        createdAt: d.createdAt,
      })),
    },
  })
}

// PATCH /api/archive/binders/[id] — ویرایش مشخصات ظاهری و ظرفیت (مدیران و حسابدار)
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!hasRole(user, 'accountant')) return fail('اجازه ویرایش بایندر را ندارید', 403)
  const { id } = await ctx.params

  const binder = await db.archiveBinder.findUnique({
    where: { id },
    include: { _count: { select: { documents: true } }, documents: { select: { pocket: true } } },
  })
  if (!binder) return fail('بایندر یافت نشد', 404)

  const body = (await req.json()) as {
    title?: string
    category?: string
    color?: string
    location?: string | null
    capacity?: number
    active?: boolean
    note?: string | null
  }

  const data: Record<string, unknown> = {}
  if (body.title !== undefined) {
    const t = body.title.trim()
    if (!t) return fail('عنوان بایندر نمی‌تواند خالی باشد')
    data.title = t
  }
  if (body.category !== undefined) {
    const c = body.category.trim()
    if (!c) return fail('گروه موضوعی نمی‌تواند خالی باشد')
    data.category = c
  }
  if (body.color !== undefined) data.color = body.color.trim() || '#8A6F3C'
  if (body.location !== undefined) data.location = body.location?.trim() || null
  if (body.note !== undefined) data.note = body.note?.trim() || null
  if (body.active !== undefined) data.active = !!body.active
  if (body.capacity !== undefined) {
    const cap = Number(body.capacity)
    if (!Number.isFinite(cap) || cap < 10 || cap > 600)
      return fail('ظرفیت بایندر باید بین ۱۰ تا ۶۰۰ جیب باشد')
    if (cap < binder.documents.length)
      return fail(`ظرفیت نمی‌تواند کمتر از شمار اسناد فعلی (${toFaDigits(binder.documents.length)} سند) باشد`)
    data.capacity = Math.round(cap)
  }

  const updated = await db.archiveBinder.update({ where: { id }, data })
  await logActivity(user.id, user.name, 'ویرایش بایندر بایگانی', 'ArchiveBinder', id, `${binder.code} — ${updated.title}`)
  return ok({ success: true, binder: updated })
}

// DELETE /api/archive/binders/[id] — غیرفعال‌سازی نرم؛ اگر سند داشته باشد مسدود است
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!hasRole(user, 'accountant')) return fail('اجازه حذف بایندر را ندارید', 403)
  const { id } = await ctx.params

  const binder = await db.archiveBinder.findUnique({
    where: { id },
    include: { _count: { select: { documents: true } }, documents: { select: { pocket: true } } },
  })
  if (!binder) return fail('بایندر یافت نشد', 404)

  if (binder.documents.length > 0)
    return fail(
      `این بایندر ${toFaDigits(binder.documents.length)} سند دارد؛ ابتدا اسناد را منتقل یا حذف کنید`,
      409
    )

  await db.archiveBinder.update({ where: { id }, data: { active: false } })
  await logActivity(user.id, user.name, 'غیرفعال‌سازی بایندر بایگانی', 'ArchiveBinder', id, binder.code)
  return ok({ success: true })
}
