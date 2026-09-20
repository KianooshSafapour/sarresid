import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, logActivity } from '@/lib/server-utils'
import { hasRole } from '@/lib/auth'

// GET /api/archive/binders — فهرست بایندرهای بایگانی + شمار اسناد (ISO 15489: طبقه‌بندی موضوعی)
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)

  const binders = await db.archiveBinder.findMany({
    include: { _count: { select: { documents: true } } },
    orderBy: { code: 'asc' },
  })
  return ok({ binders })
}

// POST /api/archive/binders — بایندر تازه با کد خودکار AB-NN (مدیران و حسابدار)
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!hasRole(user, 'accountant')) return fail('اجازه ایجاد بایندر را ندارید', 403)

  const body = (await req.json()) as {
    title?: string
    category?: string
    color?: string
    location?: string
    capacity?: number
    note?: string
  }

  const title = body.title?.trim()
  const category = body.category?.trim()
  if (!title) return fail('عنوان بایندر لازم است')
  if (!category) return fail('گروه موضوعی بایندر لازم است')

  const capacity = Number(body.capacity ?? 200)
  if (!Number.isFinite(capacity) || capacity < 10 || capacity > 600)
    return fail('ظرفیت بایندر باید بین ۱۰ تا ۶۰۰ جیب باشد')

  // کد خودکار AB-NN بر پایه بیشینه شماره موجود
  const existing = await db.archiveBinder.findMany({ select: { code: true } })
  let max = 0
  for (const b of existing) {
    const m = /^AB-(\d+)$/.exec(b.code)
    if (m) max = Math.max(max, Number(m[1]))
  }
  const code = `AB-${String(max + 1).padStart(2, '0')}`

  const binder = await db.archiveBinder.create({
    data: {
      code,
      title,
      category,
      color: body.color?.trim() || '#8A6F3C',
      location: body.location?.trim() || null,
      capacity: Math.round(capacity),
      note: body.note?.trim() || null,
    },
  })

  await logActivity(user.id, user.name, 'ایجاد بایندر بایگانی', 'ArchiveBinder', binder.id, `${code} — ${title}`)
  return ok({ success: true, binder })
}
