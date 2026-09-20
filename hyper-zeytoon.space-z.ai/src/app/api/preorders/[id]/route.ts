import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const preOrder = await db.preOrder.findUnique({ where: { id } })
  if (!preOrder) return fail('یافت نشد', 404)
  const body = await req.json()
  const data: Record<string, unknown> = {}

  if (body.action === 'cashier_edit') {
    // cashier modifies items then sends to POS (Holoo integration point)
    if (!['HC', 'CASHIER', 'GM', 'OM'].includes(me.role))
      return fail('فقط صندوق‌دار می‌تواند پردازش کند', 403)
    if (Array.isArray(body.items)) {
      data.items = JSON.stringify(body.items)
      data.total = body.items.reduce((s: number, i: any) => s + (Number(i.qty) || 0) * (Number(i.price) || 0), 0)
    }
    data.status = 'READY'
    data.cashierId = me.id
    data.cashierName = me.name
  } else if (body.action === 'done') {
    data.status = 'DONE'
  } else if (body.action === 'cancel') {
    data.status = 'CANCELLED'
  } else if (body.note !== undefined) {
    data.note = body.note
  }

  const updated = await db.preOrder.update({ where: { id }, data })
  await logActivity(me, `به‌روزرسانی پیش‌فاکتور ${preOrder.code}`, 'preOrder', id, body.action || '')
  return json({ preOrder: { ...updated, items: JSON.parse(updated.items || '[]') } })
}
