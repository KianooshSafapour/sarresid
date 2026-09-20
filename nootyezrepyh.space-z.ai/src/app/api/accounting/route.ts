import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { logAudit, logHistory } from '@/lib/audit'
import { dateToJalali, pad2 } from '@/lib/jalali'

const RECEIVED_STATUSES = ['RECEIVED', 'INSPECTED', 'TO_HOLOO', 'DONE']

function monthKey(d: Date): string {
  const { jy, jm } = dateToJalali(d)
  return `${jy}/${pad2(jm)}`
}

function jalaliDayKey(d: Date): string {
  const { jy, jm, jd } = dateToJalali(d)
  return `${jy}/${pad2(jm)}/${pad2(jd)}`
}

/** GET /api/accounting — financial overview stats + Holoo queue data */
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.ACCOUNTING)) {
    return Response.json({ error: 'شما اجازهٔ دسترسی به بخش حسابداری را ندارید' }, { status: 403 })
  }

  const includeItems = { items: true, supplier: { select: { name: true, phone: true, paymentType: true } } }
  const [queue, inHoloo, recentDone, paymentsRaw, orders, cheques, users] = await Promise.all([
    db.order.findMany({ where: { status: 'INSPECTED' }, include: includeItems, orderBy: { inspectedAt: 'asc' } }),
    db.order.findMany({ where: { status: 'TO_HOLOO' }, include: includeItems, orderBy: { updatedAt: 'asc' } }),
    db.order.findMany({
      where: { status: 'DONE' },
      include: includeItems,
      orderBy: { doneAt: 'desc' },
      take: 8,
    }),
    db.payment.findMany({ orderBy: { createdAt: 'desc' }, take: 25 }),
    db.order.findMany({ where: { status: { in: RECEIVED_STATUSES } } }),
    db.cheque.findMany({
      where: { status: { notIn: ['DONE', 'REJECTED'] } },
      orderBy: { dueDate: 'asc' },
      take: 30,
    }),
    db.user.findMany({ select: { id: true, name: true } }),
  ])

  // spend last 30 days (by receivedAt or updatedAt as fallback)
  const since = Date.now() - 30 * 86400000
  const spendByDay: Record<string, number> = {}
  for (let i = 29; i >= 0; i--) {
    spendByDay[jalaliDayKey(new Date(Date.now() - i * 86400000))] = 0
  }
  const spendBySupplier: Record<string, number> = {}
  const ordersWithStamp = await Promise.all(
    orders.map(async (o) => {
      const full = await db.order.findUnique({
        where: { id: o.id },
        select: { receivedAt: true, updatedAt: true, finalAmount: true, supplier: { select: { name: true } } },
      })
      return full
    })
  )
  for (const o of ordersWithStamp) {
    if (!o) continue
    const stamp = (o.receivedAt || o.updatedAt) as Date
    if (stamp.getTime() < since) continue
    const key = jalaliDayKey(stamp)
    if (key in spendByDay) spendByDay[key] += o.finalAmount || 0
    spendBySupplier[o.supplier.name] = (spendBySupplier[o.supplier.name] || 0) + (o.finalAmount || 0)
  }

  // this month vs last month spend
  const now = new Date()
  const thisMonthKey = monthKey(now)
  const prev = new Date(now.getFullYear(), now.getMonth(), 1)
  prev.setMonth(prev.getMonth() - 1)
  const lastMonthKey = monthKey(prev)
  let thisMonthSpend = 0
  let lastMonthSpend = 0
  for (const o of ordersWithStamp) {
    if (!o) continue
    const stamp = (o.receivedAt || o.updatedAt) as Date
    const k = monthKey(stamp)
    if (k === thisMonthKey) thisMonthSpend += o.finalAmount || 0
    else if (k === lastMonthKey) lastMonthSpend += o.finalAmount || 0
  }

  const processedCount = await db.order.count({ where: { status: 'DONE' } })
  const receivedThisMonth = ordersWithStamp.filter(
    (o) => o && monthKey((o.receivedAt || o.updatedAt) as Date) === thisMonthKey
  ).length

  const orderNumbers = await db.order.findMany({
    where: { id: { in: paymentsRaw.map((p) => p.orderId).filter((x): x is string => !!x) } },
    select: { id: true, number: true },
  })
  const numMap = new Map(orderNumbers.map((o) => [o.id, o.number]))
  const userMap = new Map(users.map((u) => [u.id, u.name]))

  const shapeItems = (items: {
    id: string
    productName: string
    holooName: string | null
    barcode: string | null
    quantity: number
    unitPrice: number
    sellPrice: number | null
    printedPrice: number | null
    discount: number
    lineTotal: number
    receivedQty: number | null
    status: string
  }[]) =>
    items.map((it) => ({
      id: it.id,
      productName: it.productName,
      holooName: it.holooName,
      barcode: it.barcode,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      sellPrice: it.sellPrice,
      printedPrice: it.printedPrice,
      discount: it.discount,
      lineTotal: it.lineTotal,
      receivedQty: it.receivedQty,
      status: it.status,
    }))

  const shapeOrder = (o: (typeof queue)[number]) => ({
    id: o.id,
    number: o.number,
    status: o.status,
    deliveryDate: o.deliveryDate,
    paymentType: o.paymentType,
    totalAmount: o.totalAmount,
    discount: o.discount,
    tax: o.tax,
    vat: o.vat,
    finalAmount: o.finalAmount,
    exportedAt: o.exportedAt,
    receivedAt: o.receivedAt,
    inspectedAt: o.inspectedAt,
    doneAt: o.doneAt,
    supplier: o.supplier,
    items: shapeItems(o.items),
  })

  return Response.json({
    queue: queue.map(shapeOrder),
    inHoloo: inHoloo.map(shapeOrder),
    recentDone: recentDone.map(shapeOrder),
    payments: paymentsRaw.map((p) => ({
      id: p.id,
      amount: p.amount,
      method: p.method,
      orderId: p.orderId,
      orderNumber: p.orderId ? numMap.get(p.orderId) ?? null : null,
      receiptNo: p.receiptNo,
      posReceipt: p.posReceipt,
      note: p.note,
      creatorName: userMap.get(p.createdById) || '',
      createdAt: p.createdAt,
    })),
    spendByDay,
    spendBySupplier,
    thisMonthSpend,
    lastMonthSpend,
    processedCount,
    receivedThisMonth,
    cheques: cheques.map((c) => ({
      id: c.id,
      number: c.number,
      amount: c.amount,
      dueDate: c.dueDate,
      status: c.status,
      payeeName: c.payeeName,
      orderNumber: c.orderId ? numMap.get(c.orderId) ?? null : null,
    })),
  })
}

/** POST /api/accounting — register a payment (cash/card) */
export async function POST(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.ACCOUNTING)) {
    return Response.json({ error: 'شما اجازهٔ ثبت پرداخت را ندارید' }, { status: 403 })
  }

  try {
    const body = (await req.json()) as {
      orderId?: string
      amount?: number
      method?: string
      receiptNo?: string
      posReceipt?: string
      note?: string
    }
    const amount = Number(body.amount)
    if (!amount || amount <= 0) {
      return Response.json({ error: 'مبلغ پرداخت باید بزرگ‌تر از صفر باشد' }, { status: 400 })
    }
    const method = ['CASH', 'CARD', 'CHEQUE'].includes(body.method || '') ? body.method! : 'CASH'

    let order: { id: string } | null = null
    if (body.orderId) {
      const found = await db.order.findUnique({ where: { id: body.orderId }, include: { supplier: true } })
      if (!found) return Response.json({ error: 'سفارش یافت نشد' }, { status: 404 })
      order = found
    }

    const payment = await db.payment.create({
      data: {
        amount,
        method,
        orderId: order?.id || null,
        receiptNo: body.receiptNo?.trim() || null,
        posReceipt: body.posReceipt?.trim() || null,
        note: body.note?.trim() || null,
        createdById: session.id,
      },
    })

    if (order) {
      await logHistory('ORDER', order.id, session.id, session.name, 'پرداخت ثبت شد', {
        amount,
        method,
        receiptNo: payment.receiptNo,
        posReceipt: payment.posReceipt,
      })
    }
    await logAudit(session.id, session.name, 'REGISTER_PAYMENT', 'PAYMENT', payment.id, {
      amount,
      method,
      orderId: order?.id,
    })

    return Response.json({ ok: true, payment })
  } catch (e) {
    console.error('payment error', e)
    return Response.json({ error: 'خطا در ثبت پرداخت' }, { status: 500 })
  }
}
