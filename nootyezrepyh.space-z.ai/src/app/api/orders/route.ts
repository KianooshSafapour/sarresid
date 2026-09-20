import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { logAudit, logHistory } from '@/lib/audit'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { toJalaali } from '@/lib/jalaali-core'

/** Today in Tehran as "1404/08/15" (server-side helper) */
function todayJalaliStr(): string {
  const t = new Date(Date.now() + 3.5 * 3600000)
  const { jy, jm, jd } = toJalaali(t.getFullYear(), t.getMonth() + 1, t.getDate())
  return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`
}

/** Next order number: starts from 101 */
async function nextOrderNumber(): Promise<number> {
  const agg = await db.order.aggregate({ _max: { number: true } })
  return Math.max(100, agg._max.number || 100) + 1
}

/** Which status a freshly created order gets, based on the creator's role */
function initialStatusFor(roles: string[], requested?: string): string {
  // explicit draft request is always allowed
  if (requested === 'DRAFT') return 'DRAFT'
  if (canUser(roles, PERMISSIONS.APPROVE_ORDERS)) return 'APPROVED' // GM / OM
  return 'PENDING_APPROVAL' // PRODUCT_MANAGER (needs GM approval)
}

interface NewItem {
  productId: string
  productName: string
  holooName: string | null
  barcode: string | null
  quantity: number
  unitPrice: number
  sellPrice: number
  discount: number
  lineTotal: number
  status: string
}

// ==================== GET /api/orders ====================
// Query params:
//   status      — filter by one status key (or ALL)
//   supplierId  — filter by supplier
//   productId   — summarized "recent orders of this product" mode (pair with lastDays)
//   lastDays    — only orders created within the last N days
//   q           — search in supplier name / order number
//   limit       — max rows (default 100)
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()

  const sp = new URL(req.url).searchParams
  const status = sp.get('status') || undefined
  const supplierId = sp.get('supplierId') || undefined
  const productId = sp.get('productId') || undefined
  const lastDays = sp.get('lastDays') ? Number(sp.get('lastDays')) : undefined
  const q = (sp.get('q') || '').trim()
  const limit = Math.min(Number(sp.get('limit')) || 100, 300)

  const where: {
    status?: string
    supplierId?: string
    createdAt?: { gte: Date }
    OR?: Array<{ supplier?: { name: { contains: string } }; number?: number }>
  } = {}
  if (status && status !== 'ALL') where.status = status
  if (supplierId) where.supplierId = supplierId
  if (lastDays && lastDays > 0) where.createdAt = { gte: new Date(Date.now() - lastDays * 86400000) }
  if (q) {
    const n = Number(q.replace(/[^\d]/g, ''))
    const cond: Array<{ supplier?: { name: { contains: string } }; number?: number }> = [{ supplier: { name: { contains: q } } }]
    if (n && !isNaN(n)) cond.push({ number: n })
    where.OR = cond
  }

  // ---- Summarized mode: recent orders of ONE product ----
  if (productId) {
    const list = await db.order.findMany({
      where,
      include: { supplier: { select: { name: true } }, items: { where: { productId } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    const summarized = list
      .map((o) => {
        const qty = o.items.reduce((s, it) => s + it.quantity, 0)
        return {
          orderId: o.id,
          orderNumber: o.number,
          supplierName: o.supplier.name,
          status: o.status,
          deliveryDate: o.deliveryDate,
          createdAt: o.createdAt,
          quantity: qty,
          unitPrice: o.items[0]?.unitPrice || 0,
          lineTotal: o.items.reduce((s, it) => s + it.lineTotal, 0),
        }
      })
      .filter((s) => s.quantity > 0)
    return Response.json(summarized)
  }

  // ---- Regular list ----
  const orders = await db.order.findMany({
    where,
    include: {
      supplier: { select: { id: true, name: true } },
      items: { select: { quantity: true, lineTotal: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  // Order has no relation to User — resolve creator names via createdById
  const creatorIds = [...new Set(orders.map((o) => o.createdById))]
  const creators = creatorIds.length ? await db.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, name: true } }) : []
  const creatorMap = new Map(creators.map((u) => [u.id, u.name]))

  const today = todayJalaliStr()
  return Response.json(
    orders.map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      deliveryDate: o.deliveryDate,
      paymentType: o.paymentType,
      totalAmount: o.finalAmount || o.totalAmount,
      itemCount: o.items.length,
      totalQty: o.items.reduce((s, it) => s + it.quantity, 0),
      supplierId: o.supplier.id,
      supplierName: o.supplier.name,
      createdByName: creatorMap.get(o.createdById) || '',
      createdAt: o.createdAt,
      notes: o.notes,
      overdue: ['APPROVED', 'EXPECTED'].includes(o.status) && o.deliveryDate < today,
    }))
  )
}

// ==================== POST /api/orders — create new order ====================
export async function POST(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.MANAGE_ORDERS))
    return Response.json({ error: 'شما اجازه ثبت سفارش ندارید' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body) return Response.json({ error: 'داده نامعتبر است' }, { status: 400 })

  const { supplierId, items, deliveryDate, paymentType, notes, discount, requestedStatus } = body as {
    supplierId?: string
    items?: { productId: string; quantity?: number; unitPrice?: number; sellPrice?: number; discount?: number }[]
    deliveryDate?: string
    paymentType?: string
    notes?: string
    discount?: number
    requestedStatus?: string
  }

  if (!supplierId) return Response.json({ error: 'انتخاب تأمین‌کننده الزامی است' }, { status: 400 })
  if (!items || !Array.isArray(items) || items.length === 0)
    return Response.json({ error: 'حداقل یک کالا به سفارش اضافه کنید' }, { status: 400 })

  const supplier = await db.supplier.findUnique({ where: { id: supplierId } })
  if (!supplier) return Response.json({ error: 'تأمین‌کننده یافت نشد' }, { status: 404 })

  // collapse duplicate products — keep last qty per product
  const qtyMap = new Map<string, { quantity: number; unitPrice?: number; sellPrice?: number; discount?: number }>()
  for (const it of items) {
    if (!it?.productId) continue
    const quantity = Number(it.quantity) || 0
    if (quantity <= 0) continue
    qtyMap.set(it.productId, { quantity, unitPrice: it.unitPrice, sellPrice: it.sellPrice, discount: it.discount })
  }
  if (qtyMap.size === 0)
    return Response.json({ error: 'تعداد کالاهای سفارش باید بیشتر از صفر باشد' }, { status: 400 })

  const products = await db.product.findMany({ where: { id: { in: [...qtyMap.keys()] } } })
  const productMap = new Map(products.map((p) => [p.id, p]))

  const itemData: NewItem[] = []
  for (const [pid, v] of qtyMap.entries()) {
    const p = productMap.get(pid)
    if (!p) continue
    const unitPrice = Number(v.unitPrice ?? p.cost) || 0
    itemData.push({
      productId: p.id,
      productName: p.name,
      holooName: p.holooName,
      barcode: p.barcode,
      quantity: v.quantity,
      unitPrice,
      sellPrice: Number(v.sellPrice ?? p.price) || p.price,
      discount: Number(v.discount) || 0,
      lineTotal: Math.max(0, unitPrice * v.quantity - (Number(v.discount) || 0)),
      status: 'OK',
    })
  }

  if (itemData.length === 0)
    return Response.json({ error: 'هیچ‌کدام از کالاها یافت نشدند' }, { status: 400 })

  const totalAmount = itemData.reduce((s, it) => s + it.lineTotal, 0)
  const disc = Math.max(0, Number(discount) || 0)
  const status = initialStatusFor(session.roles, requestedStatus)
  const payment =
    paymentType === 'CASH_ON_DELIVERY' || paymentType === 'CHEQUE'
      ? paymentType
      : supplier.paymentType || 'CHEQUE'
  const delivery =
    typeof deliveryDate === 'string' && /^\d{4}\/\d{2}\/\d{2}$/.test(deliveryDate) ? deliveryDate : todayJalaliStr()

  const order = await db.order.create({
    data: {
      number: await nextOrderNumber(),
      supplierId,
      createdById: session.id,
      status,
      deliveryDate: delivery,
      paymentType: payment,
      totalAmount,
      discount: disc,
      finalAmount: Math.max(0, totalAmount - disc),
      notes: notes || null,
      items: { create: itemData },
    },
    include: { supplier: { select: { name: true } }, items: true },
  })

  await logAudit(session.id, session.name, 'CREATE_ORDER', 'ORDER', order.id, {
    number: order.number,
    supplier: supplier.name,
    itemCount: itemData.length,
    totalAmount,
    status,
  })
  await logHistory('ORDER', order.id, session.id, session.name, 'ایجاد سفارش', {
    fromStatus: null,
    toStatus: status,
    description: `سفارش ${itemData.length} قلم کالا از «${supplier.name}» ثبت شد`,
    items: itemData.map((it) => ({ name: it.productName, qty: it.quantity, unitPrice: it.unitPrice })),
  })

  return Response.json(order)
}
