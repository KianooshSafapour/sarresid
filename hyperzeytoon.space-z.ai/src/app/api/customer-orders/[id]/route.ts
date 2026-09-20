import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, logActivity, notify, notifyRoles } from '@/lib/server-utils'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const { id } = await ctx.params
  const order = await db.customerOrder.findUnique({ where: { id } })
  if (!order) return fail('سبد یافت نشد', 404)

  const body = (await req.json().catch(() => ({}))) as { status?: string; note?: string }
  const status = body.status
  if (!status || !['PREPARING', 'SENT_TO_CASHIER', 'COMPLETED', 'CANCELLED'].includes(status))
    return fail('وضعیت نامعتبر است')

  const isSales = user.roleKeys.includes('sales')
  const isCashier = user.roleKeys.includes('cashier')
  const isOwnerSales = order.salespersonId === user.id
  const allowed =
    user.isManager ||
    (isSales && isOwnerSales) ||
    (isCashier && (order.status === 'SENT_TO_CASHIER' || order.cashierId === user.id))
  if (!allowed) return fail('دسترسی غیرمجاز', 403)

  // flow rules: sales PREPARING→SENT_TO_CASHIER ; cashier SENT_TO_CASHIER→COMPLETED|CANCELLED
  const data: Record<string, unknown> = { status }
  if (status === 'SENT_TO_CASHIER') {
    if (!user.isManager && !isSales && !isCashier) return fail('دسترسی غیرمجاز', 403)
    data.sentAt = new Date()
  }
  if (status === 'COMPLETED') {
    if (order.status !== 'SENT_TO_CASHIER' && !user.isManager) return fail('فقط سبدهای ارسال‌شده به صندوق تکمیل می‌شوند')
    data.completedAt = new Date()
    data.cashierId = user.id
  }
  if (status === 'CANCELLED' && order.status === 'SENT_TO_CASHIER') data.cashierId = user.id
  if (body.note !== undefined) data.note = body.note?.trim() || null

  const updated = await db.customerOrder.update({ where: { id: order.id }, data })

  if (status === 'SENT_TO_CASHIER') {
    await notifyRoles(['cashier'], 'سبد خرید جدید برای صندوق 🧺', `${order.customerName ?? 'مشتری'} — آماده پرداخت`, 'INFO', 'customers', user.id)
  }
  if ((status === 'COMPLETED' || status === 'CANCELLED') && order.salespersonId && order.salespersonId !== user.id) {
    await notify(
      order.salespersonId,
      status === 'COMPLETED' ? 'سبد مشتری پرداخت شد ✅' : 'سبد مشتری لغو شد',
      `${order.customerName ?? 'مشتری'} — ${order.items ? '' : ''}`,
      status === 'COMPLETED' ? 'SUCCESS' : 'WARNING',
      'customers'
    )
  }
  await logActivity(user.id, user.name, 'بروزرسانی سبد مشتری', 'CustomerOrder', order.id, `${order.customerName ?? ''} → ${status}`)
  return ok({ success: true })
}
