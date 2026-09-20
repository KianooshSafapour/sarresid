import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { canUser, PERMISSIONS } from '@/lib/constants'

export const dynamic = 'force-dynamic'

interface SaleItem { productId?: string; name: string; qty: number; price: number }

// GET /api/sale-orders?scope=mine|queue|status&status=PENDING&limit=30
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.SALES_FLOOR) && !canUser(session.roles, PERMISSIONS.CASHIER)) {
    return Response.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  }
  const sp = new URL(req.url).searchParams
  const scope = sp.get('scope') || 'mine'
  const status = sp.get('status')
  const limit = Math.min(+(sp.get('limit') || 50), 200)

  const where: Record<string, unknown> = {}
  if (scope === 'mine') where.salespersonId = session.id
  if (scope === 'queue' || scope === 'cashier') {
    // Cashier workspace: all orders, newest first (queue = PENDING by default)
    if (!status) where.status = 'PENDING'
  }
  if (status) where.status = status

  const orders = await db.saleOrder.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit })
  const salespersonIds = [...new Set(orders.map((o) => o.salespersonId))]
  const cashierIds = [...new Set(orders.map((o) => o.cashierId).filter(Boolean))] as string[]
  const users = await db.user.findMany({
    where: { id: { in: [...salespersonIds, ...cashierIds] } },
    select: { id: true, name: true, color: true },
  })
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]))

  return Response.json(
    orders.map((o) => ({
      id: o.id,
      customerId: o.customerId,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      salespersonId: o.salespersonId,
      salespersonName: userMap[o.salespersonId]?.name || '',
      cashierId: o.cashierId,
      cashierName: o.cashierId ? userMap[o.cashierId]?.name || '' : null,
      items: JSON.parse(o.items || '[]') as SaleItem[],
      total: o.total,
      status: o.status,
      note: o.note,
      cashedAt: o.cashedAt,
      createdAt: o.createdAt,
    }))
  )
}

// POST /api/sale-orders { customerId?, customerName, customerPhone?, items:[{productId,name,qty,price}], note? }
export async function POST(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.SALES_FLOOR)) {
    return Response.json({ error: 'فقط فروشندگان می‌توانند سفارش فروش ثبت کنند' }, { status: 403 })
  }
  const body = await req.json().catch(() => null)
  const items = Array.isArray(body?.items)
    ? (body.items as SaleItem[])
        .map((i) => ({ productId: i.productId || null, name: String(i.name || ''), qty: Number(i.qty) || 0, price: Number(i.price) || 0 }))
        .filter((i) => i.name && i.qty > 0)
    : []
  if (!items.length) return Response.json({ error: 'حداقل یک کالا به سفارش اضافه کنید' }, { status: 400 })

  let customerName = body?.customerName ? String(body.customerName).trim() : ''
  let customerId: string | null = null
  if (body?.customerId) {
    const customer = await db.customer.findUnique({ where: { id: String(body.customerId) } })
    if (customer) {
      customerId = customer.id
      customerName = customerName || customer.name
    }
  }
  if (!customerName) return Response.json({ error: 'نام مشتری را انتخاب یا وارد کنید' }, { status: 400 })

  // optional phone — stored normalized (digits only) for WhatsApp deep-links
  let customerPhone: string | null = null
  const rawPhone = String(body?.customerPhone || '').trim()
  if (rawPhone) {
    const digits = rawPhone.replace(/[^0-9]/g, '')
    if (digits.length < 8 || digits.length > 13) {
      return Response.json({ error: 'شماره تماس مشتری معتبر نیست' }, { status: 400 })
    }
    customerPhone = digits
  } else if (customerId) {
    const c = await db.customer.findUnique({ where: { id: customerId }, select: { phone: true } })
    customerPhone = c?.phone ? String(c.phone).replace(/[^0-9]/g, '') : null
  }

  const total = items.reduce((s, i) => s + i.qty * i.price, 0)

  const order = await db.saleOrder.create({
    data: {
      customerId,
      customerName,
      customerPhone,
      salespersonId: session.id,
      items: JSON.stringify(items),
      total,
      status: 'PENDING',
      note: body?.note ? String(body.note) : null,
    },
  })
  await logAudit(session.id, session.name, 'SALE_ORDER_CREATE', 'SALE_ORDER', order.id, {
    customerName,
    itemCount: items.length,
    total,
  })
  return Response.json({ id: order.id, total })
}
