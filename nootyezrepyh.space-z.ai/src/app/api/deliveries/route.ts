import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { canUser, PERMISSIONS } from '@/lib/constants'

/**
 * GET /api/deliveries — queues for the delivery & inspection workflow.
 * - expected: orders APPROVED/EXPECTED waiting for the receiver
 * - received: orders RECEIVED waiting for warehouse supervisor inspection
 */
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()

  const canReceive =
    canUser(session.roles, PERMISSIONS.RECEIVE_DELIVERY) ||
    canUser(session.roles, PERMISSIONS.INSPECT_DELIVERY)
  const canInspect = canUser(session.roles, PERMISSIONS.INSPECT_DELIVERY)

  const [expected, received] = await Promise.all([
    db.order.findMany({
      where: { status: { in: ['APPROVED', 'EXPECTED'] } },
      include: { items: true, supplier: { select: { name: true, phone: true, paymentType: true } } },
      orderBy: { deliveryDate: 'asc' },
    }),
    db.order.findMany({
      where: { status: 'RECEIVED' },
      include: { items: true, supplier: { select: { name: true, phone: true, paymentType: true } } },
      orderBy: { receivedAt: 'asc' },
    }),
  ])

  // attach product barcodes + current sell price to items
  const productIds = [...new Set(
    [...expected, ...received].flatMap((o) => o.items.map((i) => i.productId))
  )]
  const products = productIds.length
    ? await db.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, barcode: true, barcodes: true, price: true },
      })
    : []
  const pmap = new Map(products.map((p) => [p.id, p]))

  const shapeOrder = (o: (typeof expected)[number]) => ({
    id: o.id,
    number: o.number,
    status: o.status,
    deliveryDate: o.deliveryDate,
    paymentType: o.paymentType,
    notes: o.notes,
    totalAmount: o.totalAmount,
    discount: o.discount,
    tax: o.tax,
    vat: o.vat,
    finalAmount: o.finalAmount,
    supplier: o.supplier,
    receivedAt: o.receivedAt,
    items: o.items.map((it) => {
      const p = pmap.get(it.productId)
      return {
        id: it.id,
        productId: it.productId,
        productName: it.productName,
        holooName: it.holooName,
        barcode: it.barcode || p?.barcode || null,
        barcodes: p ? (JSON.parse(p.barcodes) as string[]) : [],
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        sellPrice: it.sellPrice,
        currentSellPrice: p?.price ?? it.sellPrice ?? null,
        printedPrice: it.printedPrice,
        discount: it.discount,
        lineTotal: it.lineTotal,
        receivedQty: it.receivedQty,
        status: it.status,
        note: it.note,
      }
    }),
  })

  return Response.json({
    canReceive,
    canInspect,
    expected: expected.map(shapeOrder),
    received: received.map(shapeOrder),
  })
}
