import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { logAudit, logHistory } from '@/lib/audit'
import { canUser, PERMISSIONS } from '@/lib/constants'

// Statuses in which the order can still be edited / cancelled (before physical receive)
const EDITABLE_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'EXPECTED']
const CANCELLABLE_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'EXPECTED']

interface PatchItem {
  id?: string
  productId: string
  quantity?: number
  unitPrice?: number
  sellPrice?: number
  discount?: number
}

// ==================== GET /api/orders/[id] — full detail + history ====================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  const { id } = await params

  const order = await db.order.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, name: true, phone: true, contactName: true, paymentType: true } },
      items: true,
      cheques: { select: { id: true, number: true, amount: true, dueDate: true, status: true } },
    },
  })
  if (!order) return Response.json({ error: 'سفارش یافت نشد' }, { status: 404 })

  const creator = await db.user.findUnique({ where: { id: order.createdById }, select: { name: true } })

  // history = audit entries tagged ORDER_HISTORY for this order
  const historyRows = await db.auditLog.findMany({
    where: { entityType: 'ORDER_HISTORY', entityId: id },
    orderBy: { createdAt: 'asc' },
  })
  const history = historyRows.map((h) => ({
    id: h.id,
    userName: h.userName,
    action: h.action,
    details: h.details ? JSON.parse(h.details) : null,
    createdAt: h.createdAt,
  }))

  return Response.json({
    id: order.id,
    number: order.number,
    status: order.status,
    deliveryDate: order.deliveryDate,
    paymentType: order.paymentType,
    totalAmount: order.totalAmount,
    discount: order.discount,
    finalAmount: order.finalAmount,
    tax: order.tax,
    vat: order.vat,
    notes: order.notes,
    createdAt: order.createdAt,
    receivedAt: order.receivedAt,
    inspectedAt: order.inspectedAt,
    lockedAt: order.lockedAt,
    holooRef: order.holooRef,
    doneAt: order.doneAt,
    createdByName: creator?.name || '',
    supplier: order.supplier,
    items: order.items.map((it) => ({
      id: it.id,
      productId: it.productId,
      productName: it.productName,
      holooName: it.holooName,
      barcode: it.barcode,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      sellPrice: it.sellPrice,
      discount: it.discount,
      lineTotal: it.lineTotal,
      receivedQty: it.receivedQty,
      status: it.status,
      note: it.note,
    })),
    cheques: order.cheques,
    history,
  })
}

// ==================== PATCH /api/orders/[id] — edit order ====================
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.MANAGE_ORDERS))
    return Response.json({ error: 'شما اجازه ویرایش سفارش ندارید' }, { status: 403 })
  const { id } = await params

  const order = await db.order.findUnique({ where: { id }, include: { items: true } })
  if (!order) return Response.json({ error: 'سفارش یافت نشد' }, { status: 404 })
  if (!EDITABLE_STATUSES.includes(order.status))
    return Response.json({ error: 'سفارش در این مرحله قابل ویرایش نیست — از «افزودن اصلاحیه» استفاده کنید' }, { status: 400 })

  const body = await req.json().catch(() => null)
  if (!body) return Response.json({ error: 'داده نامعتبر است' }, { status: 400 })

  const { items, deliveryDate, paymentType, notes, discount } = body as {
    items?: PatchItem[]
    deliveryDate?: string
    paymentType?: string
    notes?: string
    discount?: number
  }

  const changes: string[] = []

  // ---- items update: keep existing ids (other modules may reference them) ----
  if (Array.isArray(items)) {
    if (items.length === 0)
      return Response.json({ error: 'سفارش نمی‌تواند بدون کالا باشد' }, { status: 400 })

    const keepIds = new Set(items.map((it) => it.id).filter(Boolean) as string[])
    const toDelete = order.items.filter((it) => !keepIds.has(it.id))
    for (const it of toDelete) await db.orderItem.delete({ where: { id: it.id } })

    // fetch products for snapshots of new items
    const newIds = [...new Set(items.filter((it) => !it.id).map((it) => it.productId))]
    const products = newIds.length ? await db.product.findMany({ where: { id: { in: newIds } } }) : []
    const productMap = new Map(products.map((p) => [p.id, p]))

    for (const it of items) {
      const quantity = Number(it.quantity) || 0
      if (quantity <= 0) continue
      if (it.id) {
        const existing = order.items.find((x) => x.id === it.id)
        if (!existing) continue
        const unitPrice = Number(it.unitPrice ?? existing.unitPrice) || 0
        const disc = Math.max(0, Number(it.discount ?? existing.discount) || 0)
        await db.orderItem.update({
          where: { id: it.id },
          data: {
            quantity,
            unitPrice,
            sellPrice: it.sellPrice !== undefined ? Number(it.sellPrice) || existing.sellPrice : existing.sellPrice,
            discount: disc,
            lineTotal: Math.max(0, unitPrice * quantity - disc),
          },
        })
      } else {
        const p = productMap.get(it.productId)
        if (!p) continue
        const unitPrice = Number(it.unitPrice ?? p.cost) || 0
        const disc = Math.max(0, Number(it.discount) || 0)
        await db.orderItem.create({
          data: {
            orderId: id,
            productId: p.id,
            productName: p.name,
            holooName: p.holooName,
            barcode: p.barcode,
            quantity,
            unitPrice,
            sellPrice: Number(it.sellPrice ?? p.price) || p.price,
            discount: disc,
            lineTotal: Math.max(0, unitPrice * quantity - disc),
            status: 'OK',
          },
        })
      }
    }
    changes.push(`اقلام سفارش ویرایش شد (${items.length} قلم)`)
  }

  // ---- scalar fields ----
  const data: { deliveryDate?: string; paymentType?: string; notes?: string | null; discount?: number; totalAmount: number; finalAmount: number } = {
    totalAmount: 0,
    finalAmount: 0,
  }

  const finalItems = await db.orderItem.findMany({ where: { orderId: id } })
  const totalAmount = finalItems.reduce((s, it) => s + it.lineTotal, 0)
  const disc = discount !== undefined ? Math.max(0, Number(discount) || 0) : order.discount
  data.totalAmount = totalAmount
  data.discount = disc
  data.finalAmount = Math.max(0, totalAmount - disc)

  if (deliveryDate !== undefined) {
    if (deliveryDate && !/^\d{4}\/\d{2}\/\d{2}$/.test(deliveryDate))
      return Response.json({ error: 'تاریخ تحویل نامعتبر است' }, { status: 400 })
    if (deliveryDate && deliveryDate !== order.deliveryDate) {
      data.deliveryDate = deliveryDate
      changes.push(`تاریخ تحویل از ${order.deliveryDate} به ${deliveryDate} تغییر کرد`)
    }
  }
  if (paymentType !== undefined) {
    if (!['CASH_ON_DELIVERY', 'CHEQUE'].includes(paymentType))
      return Response.json({ error: 'نوع پرداخت نامعتبر است' }, { status: 400 })
    if (paymentType !== order.paymentType) {
      data.paymentType = paymentType
      changes.push(paymentType === 'CHEQUE' ? 'نوع پرداخت: چک' : 'نوع پرداخت: نقدی هنگام تحویل')
    }
  }
  if (notes !== undefined) {
    data.notes = notes || null
    changes.push('یادداشت سفارش به‌روزرسانی شد')
  }
  if (disc !== order.discount) changes.push(`تخفیف: ${disc.toLocaleString('en-US')} تومان`)

  const updated = await db.order.update({ where: { id }, data, include: { items: true } })

  await logAudit(session.id, session.name, 'UPDATE_ORDER', 'ORDER', id, {
    number: updated.number,
    changes,
    totalAmount: updated.totalAmount,
  })
  await logHistory('ORDER', id, session.id, session.name, 'ویرایش سفارش', {
    fromStatus: order.status,
    toStatus: order.status,
    description: changes.length ? changes.join(' • ') : 'به‌روزرسانی جزئی سفارش',
    totalAmount: updated.totalAmount,
  })

  return Response.json(updated)
}

// ==================== DELETE /api/orders/[id] — cancel order ====================
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.MANAGE_ORDERS))
    return Response.json({ error: 'شما اجازه لغو سفارش ندارید' }, { status: 403 })
  const { id } = await params

  const order = await db.order.findUnique({ where: { id }, include: { supplier: { select: { name: true } } } })
  if (!order) return Response.json({ error: 'سفارش یافت نشد' }, { status: 404 })
  if (!CANCELLABLE_STATUSES.includes(order.status))
    return Response.json({ error: 'سفارش‌های دریافت‌شده قابل لغو نیستند' }, { status: 400 })
  if (order.status === 'CANCELLED') return Response.json({ error: 'این سفارش قبلاً لغو شده است' }, { status: 400 })

  const updated = await db.order.update({ where: { id }, data: { status: 'CANCELLED' } })

  await logAudit(session.id, session.name, 'CANCEL_ORDER', 'ORDER', id, {
    number: updated.number,
    supplier: order.supplier.name,
    previousStatus: order.status,
  })
  await logHistory('ORDER', id, session.id, session.name, 'لغو سفارش', {
    fromStatus: order.status,
    toStatus: 'CANCELLED',
    description: `سفارش از «${order.supplier.name}» لغو شد`,
  })

  return Response.json({ ok: true, status: updated.status })
}
