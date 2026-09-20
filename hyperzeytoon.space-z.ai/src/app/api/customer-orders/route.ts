import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, logActivity, notifyRoles } from '@/lib/server-utils'

interface OrderItemInput {
  productId?: string
  name: string
  qty: number
  price: number
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const isSales = user.roleKeys.includes('sales')
  const isCashier = user.roleKeys.includes('cashier')

  let where = {}
  if (user.isManager) where = {}
  else if (isCashier) where = { OR: [{ status: 'SENT_TO_CASHIER' }, { salespersonId: user.id }, { cashierId: user.id }] }
  else if (isSales) where = { salespersonId: user.id }
  else return fail('دسترسی غیرمجاز', 403)

  const orders = await db.customerOrder.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 80,
  })
  return ok({ orders: orders.map((o) => ({ ...o, items: safeParse(o.items) })) })
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

// sales + managers create pre-checkout baskets
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!user.isManager && !user.roleKeys.includes('sales')) return fail('دسترسی غیرمجاز', 403)

  const body = (await req.json().catch(() => ({}))) as {
    customerId?: string
    customerName?: string
    items?: OrderItemInput[]
    total?: number
    note?: string
    sendToCashier?: boolean
  }
  const items = (body.items ?? []).filter((i) => i.name?.trim() && i.qty > 0)
  if (items.length === 0) return fail('سبد خالی است — حداقل یک کالا اضافه کنید')

  let customerName = body.customerName?.trim() || null
  if (body.customerId) {
    const c = await db.customer.findUnique({ where: { id: body.customerId } })
    if (c) customerName = c.name
  }
  const total = body.total ?? items.reduce((s, i) => s + i.qty * i.price, 0)
  const sendToCashier = body.sendToCashier ?? false

  const created = await db.customerOrder.create({
    data: {
      customerId: body.customerId || null,
      customerName,
      salespersonId: user.id,
      status: sendToCashier ? 'SENT_TO_CASHIER' : 'PREPARING',
      items: JSON.stringify(items),
      total,
      note: body.note?.trim() || null,
      sentAt: sendToCashier ? new Date() : null,
    },
  })

  if (sendToCashier) {
    await notifyRoles(['cashier'], 'سبد خرید جدید برای صندوق 🧺', `${customerName ?? 'مشتری'} — آماده پرداخت`, 'INFO', 'customers', user.id)
  }
  await logActivity(user.id, user.name, sendToCashier ? 'ارسال سبد به صندوق' : 'ثبت سبد خرید مشتری', 'CustomerOrder', created.id, customerName ?? undefined)
  return ok({ success: true, id: created.id })
}
