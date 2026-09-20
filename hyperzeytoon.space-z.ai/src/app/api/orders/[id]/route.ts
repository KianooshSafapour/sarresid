import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, logActivity } from '@/lib/server-utils'
import { buildItemRows, orderTotals, type RawItemInput } from '../_calc'

async function loadFullOrder(id: string) {
  const order = await db.order.findUnique({
    where: { id },
    include: {
      items: true,
      history: { orderBy: { createdAt: 'asc' } },
      cheques: { orderBy: { dueDate: 'asc' } },
      payments: { orderBy: { createdAt: 'asc' } },
      provider: { select: { name: true, phone: true, color: true } },
    },
  })
  if (!order) return null

  // creator/approver names (no relation on Order — resolve via lookup)
  const userIds = Array.from(new Set([order.createdById, order.approvedById].filter(Boolean))) as string[]
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : []
  const nameById = new Map(users.map((u) => [u.id, u.name]))
  return { order, createdByName: nameById.get(order.createdById) ?? '', approvedByName: order.approvedById ? nameById.get(order.approvedById) ?? null : null }
}

// ---------- GET: full order detail ----------
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const { id } = await params

  const loaded = await loadFullOrder(id)
  if (!loaded) return fail('سفارش یافت نشد', 404)
  const { order, createdByName, approvedByName } = loaded

  return ok({
    ...order,
    createdByName,
    approvedByName,
    providerPhone: order.provider?.phone ?? null,
    items: order.items,
    history: order.history,
    cheques: order.cheques.map((c) => ({ ...c, orderCode: order.code })),
    payments: order.payments,
  })
}

// ---------- PATCH: edit items / labels while PENDING_APPROVAL or APPROVED and not locked ----------
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const { id } = await params

  const order = await db.order.findUnique({ where: { id }, include: { items: true } })
  if (!order) return fail('سفارش یافت نشد', 404)
  if (!['PENDING_APPROVAL', 'APPROVED'].includes(order.status))
    return fail('سفارش در این مرحله قابل ویرایش نیست — پس از قفل، فقط اصلاحیه امکان‌پذیر است')
  if (order.lockedAt) return fail('سفارش قفل شده است؛ اصلاحات از مسیر دریافت/انبار انجام شود')
  if (order.createdById !== user.id && !user.isManager) return fail('فقط ثبت‌کننده یا مدیران می‌توانند ویرایش کنند', 403)

  const body = (await req.json()) as {
    note?: string
    correctionNote?: string
    receivingDate?: string
    paymentType?: string
    items?: RawItemInput[]
  }

  const data: Record<string, unknown> = {}
  if (body.note !== undefined) data.note = body.note || null
  if (body.correctionNote !== undefined) data.correctionNote = body.correctionNote || null
  if (body.receivingDate) data.receivingDate = new Date(body.receivingDate)
  if (body.paymentType) data.paymentType = body.paymentType === 'CASH' ? 'CASH' : 'CHEQUE'

  let diff = ''
  const oldTotal = order.finalAmount

  if (Array.isArray(body.items)) {
    const productIds = body.items.map((i) => i?.productId).filter(Boolean) as string[]
    const products = productIds.length
      ? await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, buyPrice: true } })
      : []
    const buyMap = new Map(products.map((p) => [p.id, p.buyPrice]))
    const rows = buildItemRows(body.items, (pid) => buyMap.get(pid) ?? null)
    if (rows.length === 0) return fail('ردیف‌های سفارش معتبر نیستند')
    const totals = orderTotals(rows)
    data.totalAmount = totals.totalAmount
    data.discount = totals.discount
    data.tax = totals.tax
    data.vat = totals.vat
    data.finalAmount = totals.finalAmount

    const qtyChanges = order.items.filter((old) => {
      const nw = rows.find((r) => r.productId === old.productId || r.name === old.name)
      return !nw || nw.qty !== old.qty || nw.unitPrice !== old.unitPrice
    }).length
    diff = `${order.items.length}→${rows.length} قلم؛ ${qtyChanges} ردیف تغییر؛ مبلغ ${oldTotal.toLocaleString('fa-IR')}→${totals.finalAmount.toLocaleString('fa-IR')}`

    await db.orderItem.deleteMany({ where: { orderId: order.id } })
    data.items = { create: rows }
  }

  if (!diff) diff = 'ویرایش اطلاعات سفارش'

  const updated = await db.order.update({
    where: { id: order.id },
    data: {
      ...data,
      history: {
        create: {
          userId: user.id,
          userName: user.name,
          action: 'ویرایش سفارش',
          detail: diff,
        },
      },
    },
    include: { items: true },
  })

  await logActivity(user.id, user.name, 'ویرایش سفارش', 'Order', order.id, `${order.code} — ${diff}`)
  return ok({ success: true, order: updated })
}
