import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { logAudit, logHistory } from '@/lib/audit'

interface Correction {
  itemId: string
  printedPrice?: number | null
  sellPrice?: number | null
  discount?: number
  note?: string
}

interface Body {
  corrections?: Correction[]
  note?: string
  allowPriceFix?: boolean
}

/**
 * POST /api/orders/[id]/inspect
 * - Warehouse supervisor (INSPECT_DELIVERY) confirms inspection on a RECEIVED order → INSPECTED
 * - Accountant with allowPriceFix=true can fix printedPrice/sellPrice/discount on INSPECTED/TO_HOLOO orders (no status change)
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()

  const { id } = await params
  try {
    const body = (await req.json()) as Body
    const isSupervisor = canUser(session.roles, PERMISSIONS.INSPECT_DELIVERY)
    const isAccountant = canUser(session.roles, PERMISSIONS.ACCOUNTING)
    const priceFixMode = !!body.allowPriceFix

    if (priceFixMode) {
      if (!isAccountant) {
        return Response.json({ error: 'فقط حسابدار اجازهٔ اصلاح قیمت دارد' }, { status: 403 })
      }
    } else if (!isSupervisor) {
      return Response.json({ error: 'شما اجازهٔ کنترل انبار را ندارید' }, { status: 403 })
    }

    const order = await db.order.findUnique({ where: { id }, include: { items: true } })
    if (!order) return Response.json({ error: 'سفارش یافت نشد' }, { status: 404 })

    if (!priceFixMode) {
      if (order.status !== 'RECEIVED') {
        return Response.json({ error: 'این سفارش در انتظار کنترل انبار نیست' }, { status: 400 })
      }
    } else if (!['INSPECTED', 'TO_HOLOO'].includes(order.status)) {
      return Response.json({ error: 'اصلاح قیمت فقط برای سفارش‌های کنترل‌شده ممکن است' }, { status: 400 })
    }

    const itemMap = new Map(order.items.map((i) => [i.id, i]))
    const applied: unknown[] = []

    for (const c of body.corrections || []) {
      const item = itemMap.get(c.itemId)
      if (!item) continue
      const data: Record<string, unknown> = {}
      if (typeof c.printedPrice === 'number' && isFinite(c.printedPrice) && c.printedPrice > 0) {
        data.printedPrice = c.printedPrice
      }
      if (typeof c.sellPrice === 'number' && isFinite(c.sellPrice) && c.sellPrice > 0) {
        data.sellPrice = c.sellPrice
      }
      if (typeof c.discount === 'number' && isFinite(c.discount) && c.discount >= 0) {
        data.discount = c.discount
      }
      if (c.note !== undefined) data.note = c.note?.trim() ? c.note.trim() : null
      if (Object.keys(data).length === 0) continue

      const merged = { ...item, ...data } as typeof item
      const effective = merged.printedPrice && merged.printedPrice > 0 ? merged.printedPrice : merged.unitPrice
      const qty = merged.receivedQty ?? merged.quantity
      const lineTotal = Math.max(0, qty * effective - merged.discount)

      await db.orderItem.update({ where: { id: item.id }, data: { ...data, lineTotal } })
      applied.push({ itemId: item.id, name: item.productName, ...data, lineTotal })
    }

    // recompute order totals
    const items = await db.orderItem.findMany({ where: { orderId: order.id } })
    const totalAmount = items.reduce((s, i) => s + i.lineTotal, 0)
    const totalDiscount = items.reduce((s, i) => s + i.discount, 0)
    const finalAmount = totalAmount + (order.tax || 0) + (order.vat || 0)

    let updatedOrder
    if (priceFixMode) {
      updatedOrder = await db.order.update({
        where: { id: order.id },
        data: { totalAmount, discount: totalDiscount, finalAmount },
        include: { items: true },
      })
      await logHistory('ORDER', order.id, session.id, session.name, 'اصلاح قیمت توسط حسابدار', {
        corrections: applied,
        totals: { totalAmount, finalAmount },
      })
    } else {
      updatedOrder = await db.order.update({
        where: { id: order.id },
        data: {
          status: 'INSPECTED',
          inspectedAt: new Date(),
          inspectedById: session.id,
          totalAmount,
          discount: totalDiscount,
          finalAmount,
        },
        include: { items: true },
      })
      await logHistory('ORDER', order.id, session.id, session.name, 'کنترل و تأیید انبار', {
        note: body.note?.trim() || undefined,
        corrections: applied,
        totals: { totalAmount, discount: totalDiscount, finalAmount },
        items: items.map((i) => ({
          name: i.productName,
          ordered: i.quantity,
          received: i.receivedQty,
          status: i.status,
        })),
      })
      await logAudit(session.id, session.name, 'INSPECT_DELIVERY', 'ORDER', order.id, {
        number: order.number,
        finalAmount,
      })
    }

    return Response.json({ ok: true, order: updatedOrder })
  } catch (e) {
    console.error('inspect error', e)
    return Response.json({ error: 'خطا در ثبت کنترل سفارش' }, { status: 500 })
  }
}
