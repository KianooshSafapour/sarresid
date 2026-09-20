import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { canUser, PERMISSIONS } from '@/lib/constants'

export const dynamic = 'force-dynamic'

// GET /api/cheques/order-options
// Fallback endpoint for "linked order" picker: open cheque-payment orders.
// Tries /api/orders?statuses=APPROVED,EXPECTED first from the client; this route
// reads db.order directly as a reliable fallback.
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.MANAGE_CHEQUES) && !canUser(session.roles, PERMISSIONS.APPROVE_CHEQUES) && !canUser(session.roles, PERMISSIONS.ACCOUNTING)) {
    return Response.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  }
  const sp = new URL(req.url).searchParams
  const q = sp.get('q')?.trim()

  const orders = await db.order.findMany({
    where: {
      status: { in: ['APPROVED', 'EXPECTED'] },
      paymentType: 'CHEQUE',
    },
    include: { supplier: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const filtered = q ? orders.filter((o) => o.supplier.name.includes(q) || String(o.number).includes(q)) : orders

  return Response.json(
    filtered.map((o) => ({
      id: o.id,
      number: o.number,
      supplierName: o.supplier.name,
      deliveryDate: o.deliveryDate,
      amount: o.finalAmount || o.totalAmount,
      status: o.status,
      paymentType: o.paymentType,
    }))
  )
}
