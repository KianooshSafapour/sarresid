import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { logAudit, logHistory } from '@/lib/audit'

interface ReceiveItemPayload {
  itemId: string
  receivedQty: number
  status: string // OK | MISSING | REJECTED
  note?: string
  printedPrice?: number | null
  discount?: number
}

interface Body {
  items: ReceiveItemPayload[]
  newBarcodes?: { productId: string; barcode: string }[]
  tax?: number
  vat?: number
  finalAmount?: number
  invoiceTotal?: number
}

/** POST /api/orders/[id]/receive — register the real received goods for an order */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.RECEIVE_DELIVERY) && !canUser(session.roles, PERMISSIONS.INSPECT_DELIVERY)) {
    return Response.json({ error: 'شما اجازهٔ ثبت دریافت مرسولات را ندارید' }, { status: 403 })
  }

  const { id } = await params
  try {
    const body = (await req.json()) as Body
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return Response.json({ error: 'اقلام سفارش ارسال نشده است' }, { status: 400 })
    }

    const order = await db.order.findUnique({ where: { id }, include: { items: true, supplier: true } })
    if (!order) return Response.json({ error: 'سفارش یافت نشد' }, { status: 404 })
    if (!['APPROVED', 'EXPECTED'].includes(order.status)) {
      return Response.json({ error: 'این سفارش در مرحلهٔ دریافت نیست' }, { status: 400 })
    }

    const itemMap = new Map(order.items.map((i) => [i.id, i]))
    for (const p of body.items) {
      if (!itemMap.has(p.itemId)) {
        return Response.json({ error: 'یکی از اقلام متعلق به این سفارش نیست' }, { status: 400 })
      }
    }

    const appliedBarcodes: { productId: string; productName: string; barcode: string }[] = []
    for (const nb of body.newBarcodes || []) {
      const barcode = String(nb.barcode || '').trim()
      if (!barcode || !nb.productId) continue
      const product = await db.product.findUnique({ where: { id: nb.productId } })
      if (!product) continue
      const list: string[] = JSON.parse(product.barcodes || '[]')
      if (!list.includes(barcode)) list.push(barcode)
      await db.product.update({
        where: { id: product.id },
        data: { barcodes: JSON.stringify(list), barcode: product.barcode || barcode },
      })
      appliedBarcodes.push({ productId: product.id, productName: product.name, barcode })
    }

    let totalAmount = 0
    let totalDiscount = 0
    const snapshotItems: unknown[] = []

    for (const p of body.items) {
      const item = itemMap.get(p.itemId)!
      const status = ['OK', 'MISSING', 'REJECTED'].includes(p.status) ? p.status : 'OK'
      const receivedQty = Math.max(0, Number(p.receivedQty) || 0)
      const printedPrice =
        typeof p.printedPrice === 'number' && isFinite(p.printedPrice) && p.printedPrice > 0
          ? p.printedPrice
          : item.printedPrice
      const discount = Math.max(0, Number(p.discount) || 0)
      const effectivePrice = printedPrice && printedPrice > 0 ? printedPrice : item.unitPrice
      const lineTotal = status === 'OK' ? Math.max(0, receivedQty * effectivePrice - discount) : 0

      await db.orderItem.update({
        where: { id: item.id },
        data: {
          receivedQty,
          status,
          note: p.note?.trim() ? p.note.trim() : null,
          printedPrice: printedPrice ?? null,
          discount,
          lineTotal,
        },
      })
      totalAmount += lineTotal
      totalDiscount += discount
      snapshotItems.push({
        name: item.productName,
        ordered: item.quantity,
        received: receivedQty,
        status,
        price: effectivePrice,
        discount,
        note: p.note?.trim() || undefined,
      })
    }

    const tax = Math.max(0, Number(body.tax) || 0)
    const vat = Math.max(0, Number(body.vat) || 0)
    const finalAmount = totalAmount + tax + vat

    const updated = await db.order.update({
      where: { id: order.id },
      data: {
        status: 'RECEIVED',
        receivedAt: new Date(),
        receivedById: session.id,
        totalAmount,
        discount: totalDiscount,
        tax,
        vat,
        finalAmount,
      },
      include: { items: true },
    })

    await logHistory('ORDER', order.id, session.id, session.name, 'دریافت مرسولات', {
      supplier: order.supplier.name,
      deliveryDate: order.deliveryDate,
      items: snapshotItems,
      totals: { totalAmount, discount: totalDiscount, tax, vat, finalAmount },
      invoiceTotal: body.invoiceTotal ?? undefined,
      newBarcodes: appliedBarcodes,
    })
    await logAudit(session.id, session.name, 'RECEIVE_DELIVERY', 'ORDER', order.id, {
      number: order.number,
      finalAmount,
    })

    return Response.json({ ok: true, order: updated })
  } catch (e) {
    console.error('receive error', e)
    return Response.json({ error: 'خطا در ثبت دریافت سفارش' }, { status: 500 })
  }
}
