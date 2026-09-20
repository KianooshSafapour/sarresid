import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { canUser, PERMISSIONS } from '@/lib/constants'

export const dynamic = 'force-dynamic'

interface SaleItem { productId?: string | null; name: string; qty: number; price: number }

// PATCH /api/sale-orders/[id]
// body: { action: 'accept', items?, total?, note? }  → PENDING→ACCEPTED (cashier reviewed/pre-registered)
//       { action: 'cash' }                            → ACCEPTED→CASHED (checkout done)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.CASHIER)) {
    return Response.json({ error: 'فقط صندوق‌دارها به این عملیات دسترسی دارند' }, { status: 403 })
  }
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const action = String(body?.action || '')
  const order = await db.saleOrder.findUnique({ where: { id } })
  if (!order) return Response.json({ error: 'سفارش فروش یافت نشد' }, { status: 404 })

  if (action === 'accept') {
    if (order.status !== 'PENDING') return Response.json({ error: 'این سفارش قبلاً تأیید شده است' }, { status: 400 })
    const data: Record<string, unknown> = { status: 'ACCEPTED', cashierId: session.id }
    if (Array.isArray(body?.items) && body.items.length) {
      const items: SaleItem[] = (body.items as SaleItem[])
        .map((i) => ({ productId: i.productId || null, name: String(i.name || ''), qty: Number(i.qty) || 0, price: Number(i.price) || 0 }))
        .filter((i) => i.name && i.qty > 0)
      if (!items.length) return Response.json({ error: 'اقلام سفارش معتبر نیست' }, { status: 400 })
      data.items = JSON.stringify(items)
      data.total = items.reduce((s, i) => s + i.qty * i.price, 0)
    }
    if (body?.note !== undefined) data.note = body.note ? String(body.note) : null
    const updated = await db.saleOrder.update({ where: { id }, data })
    await logAudit(session.id, session.name, 'SALE_ORDER_ACCEPT', 'SALE_ORDER', id, {
      customerName: order.customerName,
      total: updated.total,
    })
    return Response.json({ ok: true, order: { ...updated, items: JSON.parse(updated.items || '[]') } })
  }

  if (action === 'cash') {
    if (order.status !== 'ACCEPTED') return Response.json({ error: 'برای تسویه، سفارش باید تأیید شده باشد' }, { status: 400 })
    const updated = await db.saleOrder.update({
      where: { id },
      data: { status: 'CASHED', cashedAt: new Date(), cashierId: session.id },
    })
    await logAudit(session.id, session.name, 'SALE_ORDER_CASH', 'SALE_ORDER', id, {
      customerName: order.customerName,
      total: updated.total,
    })
    return Response.json({ ok: true, order: { ...updated, items: JSON.parse(updated.items || '[]') } })
  }

  return Response.json({ error: 'عملیات نامعتبر است' }, { status: 400 })
}
