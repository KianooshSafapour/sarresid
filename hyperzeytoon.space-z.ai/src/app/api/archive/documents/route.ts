import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, logActivity } from '@/lib/server-utils'
import { hasRole } from '@/lib/auth'
import { toFaDigits } from '@/lib/jalali'

const DOC_TYPES = ['INVOICE', 'RECEIPT', 'CHEQUE', 'STATEMENT', 'CONTRACT', 'OTHER']

// GET /api/archive/documents?binderId=&q=&docType=&providerId=
// جست‌وجوی سراسری اسناد (عنوان/یادداشت/نام تأمین‌کننده) با خروجی مسیر فیزیکی کامل
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)

  const url = new URL(req.url)
  const binderId = url.searchParams.get('binderId') || undefined
  const q = url.searchParams.get('q')?.trim()
  const docType = url.searchParams.get('docType') || undefined
  const providerId = url.searchParams.get('providerId') || undefined
  const take = Math.min(Number(url.searchParams.get('take') ?? 60), 200)

  const where: Record<string, unknown> = {}
  if (binderId) where.binderId = binderId
  if (docType && DOC_TYPES.includes(docType)) where.docType = docType
  if (providerId) where.providerId = providerId
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { note: { contains: q } },
      { provider: { name: { contains: q } } },
    ]
  }

  const docs = await db.archiveDocument.findMany({
    where,
    include: {
      binder: { select: { code: true, title: true, color: true, location: true, capacity: true } },
      provider: { select: { name: true, color: true } },
    },
    orderBy: { createdAt: 'desc' },
    take,
  })

  return ok({
    documents: docs.map((d) => ({
      id: d.id,
      pocket: d.pocket,
      docType: d.docType,
      title: d.title,
      docDate: d.docDate,
      amount: d.amount,
      note: d.note,
      providerId: d.providerId,
      providerName: d.provider?.name ?? null,
      providerColor: d.provider?.color ?? null,
      createdAt: d.createdAt,
      binder: d.binder,
    })),
  })
}

// POST /api/archive/documents — ثبت سند در جیب بایندر (مدیران و حسابدار)
// اگر pocket ارسال نشود، نخستین جیب خالی پیشنهاد می‌شود
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!hasRole(user, 'accountant')) return fail('اجازه ثبت سند بایگانی را ندارید', 403)

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

  const title = body.title?.trim()
  if (!body.binderId) return fail('بایندر مقصد لازم است')
  if (!title) return fail('عنوان سند لازم است')
  const docType = DOC_TYPES.includes(body.docType ?? '') ? (body.docType as string) : 'INVOICE'

  const binder = await db.archiveBinder.findUnique({ where: { id: body.binderId } })
  if (!binder) return fail('بایندر یافت نشد', 404)

  // جیب: صریح یا نخستین خالی
  let pocket = body.pocket !== undefined && body.pocket !== null ? Number(body.pocket) : 0
  const used = await db.archiveDocument.findMany({
    where: { binderId: binder.id },
    select: { pocket: true },
  })
  const usedSet = new Set(used.map((u) => u.pocket))
  if (!pocket) {
    for (let i = 1; i <= binder.capacity; i++) {
      if (!usedSet.has(i)) {
        pocket = i
        break
      }
    }
    if (!pocket) return fail('ظرفیت این بایندر پر است؛ بایندر تازه‌ای بسازید', 409)
  }
  if (!Number.isInteger(pocket) || pocket < 1) return fail('شماره جیب نامعتبر است')
  if (pocket > binder.capacity)
    return fail(`شماره جیب بیشتر از ظرفیت بایندر است (بیشینه ${toFaDigits(binder.capacity)})`)

  const clash = usedSet.has(pocket)
  if (clash) return fail(`جیب ${toFaDigits(pocket)} این بایندر اشغال است`, 409)

  if (body.providerId) {
    const prov = await db.provider.findUnique({ where: { id: body.providerId }, select: { id: true } })
    if (!prov) return fail('تأمین‌کننده یافت نشد', 404)
  }

  const doc = await db.archiveDocument.create({
    data: {
      binderId: binder.id,
      pocket,
      docType,
      title,
      docDate: body.docDate ? new Date(`${body.docDate}T00:00:00`) : null,
      amount: body.amount !== undefined && body.amount !== null && Number(body.amount) > 0 ? Number(body.amount) : null,
      providerId: body.providerId || null,
      orderId: body.orderId || null,
      chequeId: body.chequeId || null,
      note: body.note?.trim() || null,
      createdById: user.id,
    },
  })

  await logActivity(
    user.id,
    user.name,
    'ثبت سند بایگانی',
    'ArchiveDocument',
    doc.id,
    `${binder.code} جیب ${toFaDigits(pocket)} — ${title}`
  )
  return ok({ success: true, document: doc, suggestedPocket: pocket })
}
