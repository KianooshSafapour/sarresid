import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { logAudit, logHistory } from '@/lib/audit'

/** POST /api/orders/[id]/mark-done — accountant moves order TO_HOLOO then DONE */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.ACCOUNTING)) {
    return Response.json({ error: 'فقط حسابدار اجازهٔ ثبت نهایی سفارش را دارد' }, { status: 403 })
  }

  const { id } = await params
  try {
    const body = (await req.json()) as { stage?: string }
    const stage = body.stage
    if (!['TO_HOLOO', 'DONE'].includes(stage || '')) {
      return Response.json({ error: 'مرحلهٔ نامعتبر است' }, { status: 400 })
    }

    const order = await db.order.findUnique({ where: { id }, include: { supplier: true } })
    if (!order) return Response.json({ error: 'سفارش یافت نشد' }, { status: 404 })

    if (stage === 'TO_HOLOO') {
      if (order.status !== 'INSPECTED') {
        return Response.json({ error: 'سفارش باید ابتدا کنترل انبار شده باشد' }, { status: 400 })
      }
      await db.order.update({ where: { id: order.id }, data: { status: 'TO_HOLOO' } })
      await logHistory('ORDER', order.id, session.id, session.name, 'ثبت در هلو', {
        number: order.number,
        supplier: order.supplier.name,
        finalAmount: order.finalAmount,
      })
      await logAudit(session.id, session.name, 'TO_HOLOO', 'ORDER', order.id, { number: order.number })
      return Response.json({ ok: true, status: 'TO_HOLOO' })
    }

    // stage DONE
    if (order.status !== 'TO_HOLOO') {
      return Response.json({ error: 'سفارش باید در مرحلهٔ ثبت در هلو باشد' }, { status: 400 })
    }
    await db.order.update({
      where: { id: order.id },
      data: { status: 'DONE', doneAt: new Date(), doneById: session.id },
    })
    await logHistory('ORDER', order.id, session.id, session.name, 'تکمیل و ثبت نهایی سفارش', {
      number: order.number,
      supplier: order.supplier.name,
      finalAmount: order.finalAmount,
    })
    await logAudit(session.id, session.name, 'ORDER_DONE', 'ORDER', order.id, { number: order.number })
    return Response.json({ ok: true, status: 'DONE' })
  } catch (e) {
    console.error('mark-done error', e)
    return Response.json({ error: 'خطا در ثبت نهایی سفارش' }, { status: 500 })
  }
}
