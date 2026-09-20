import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, logActivity, notifyRoles } from '@/lib/server-utils'
import { hasRole } from '@/lib/auth'
import { buildItemRows, orderTotals, nextOrderCode, type RawItemInput } from './_calc'

// ---------- GET: list orders (internal team — everyone with a session) ----------
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const q = url.searchParams.get('q')?.trim()
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')

  const where: Record<string, unknown> = {}
  if (status && status !== 'ALL') where.status = status
  if (q) where.OR = [{ code: { contains: q } }, { providerName: { contains: q } }]
  if (from || to) {
    const range: Record<string, string> = {}
    if (from) range.gte = from
    if (to) range.lte = to
    where.receivingDate = range
  }

  const orders = await db.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      _count: { select: { items: true } },
      provider: { select: { name: true, color: true } },
    },
  })

  // creator names (no relation on Order — resolve via lookup)
  const creatorIds = Array.from(new Set(orders.map((o) => o.createdById).filter(Boolean)))
  const creators = creatorIds.length
    ? await db.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, name: true } })
    : []
  const creatorNames = new Map(creators.map((u) => [u.id, u.name]))

  return ok(
    orders.map((o) => ({
      id: o.id,
      code: o.code,
      providerId: o.providerId,
      providerName: o.providerName,
      providerColor: o.provider?.color ?? '#8A6F3C',
      companyName: o.companyName,
      status: o.status,
      paymentType: o.paymentType,
      receivingDate: o.receivingDate,
      deliveredAt: o.deliveredAt,
      confirmedAt: o.confirmedAt,
      accountingDoneAt: o.accountingDoneAt,
      totalAmount: o.totalAmount,
      discount: o.discount,
      tax: o.tax,
      vat: o.vat,
      finalAmount: o.finalAmount,
      holooTotal: o.holooTotal,
      note: o.note,
      correctionNote: o.correctionNote,
      lockedAt: o.lockedAt,
      createdById: o.createdById,
      createdByName: creatorNames.get(o.createdById) ?? '',
      createdAt: o.createdAt,
      itemsCount: o._count.items,
    }))
  )
}

// ---------- POST: create order (gm / pm / om / owner + managers) ----------
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!hasRole(user, 'gm', 'pm', 'om', 'owner')) return fail('شما اجازه ثبت سفارش ندارید', 403)

  const body = (await req.json()) as {
    providerId?: string
    providerName?: string
    companyName?: string
    paymentType?: string
    receivingDate?: string
    note?: string
    items?: RawItemInput[]
  }

  if (!body.items || !Array.isArray(body.items) || body.items.length === 0)
    return fail('حداقل یک قلم کالا لازم است')
  if (!body.receivingDate) return fail('تاریخ دریافت لازم است')

  // resolve provider snapshot
  let providerId = body.providerId ?? null
  let providerName = body.providerName ?? ''
  let companyName = body.companyName ?? null
  if (providerId) {
    const p = await db.provider.findUnique({
      where: { id: providerId },
      select: { name: true, companies: { take: 1, include: { company: { select: { name: true } } } } },
    })
    if (!p) return fail('تأمین‌کننده یافت نشد')
    providerName = providerName || p.name
    if (!companyName && p.companies[0]) companyName = p.companies[0].company.name
  }
  if (!providerName) return fail('انتخاب تأمین‌کننده لازم است')

  const productIds = body.items.map((i) => i.productId).filter(Boolean) as string[]
  const products = productIds.length
    ? await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, buyPrice: true } })
    : []
  const buyMap = new Map(products.map((p) => [p.id, p.buyPrice]))

  const rows = buildItemRows(body.items, (pid) => buyMap.get(pid) ?? null)
  if (rows.length === 0) return fail('ردیف‌های سفارش معتبر نیستند')
  const totals = orderTotals(rows)

  const code = await nextOrderCode()
  const receivingDate = new Date(body.receivingDate)

  const order = await db.order.create({
    data: {
      code,
      providerId,
      providerName,
      companyName,
      createdById: user.id,
      status: 'PENDING_APPROVAL',
      paymentType: body.paymentType === 'CASH' ? 'CASH' : 'CHEQUE',
      receivingDate,
      note: body.note ?? null,
      totalAmount: totals.totalAmount,
      discount: totals.discount,
      tax: totals.tax,
      vat: totals.vat,
      finalAmount: totals.finalAmount,
      items: { create: rows },
      history: {
        create: {
          userId: user.id,
          userName: user.name,
          action: 'ایجاد سفارش',
          detail: `${rows.length} قلم کالا — مبلغ ${totals.finalAmount.toLocaleString('fa-IR')} تومان`,
        },
      },
    },
    include: { items: true },
  })

  await logActivity(user.id, user.name, 'ثبت سفارش جدید', 'Order', order.id, `${code} — ${providerName}`)
  await notifyRoles(['gm', 'om'], 'سفارش جدید در انتظار تأیید', `${code} از ${providerName} توسط ${user.name} ثبت شد.`, 'INFO', 'orders', user.id)

  return ok({ success: true, order })
}
