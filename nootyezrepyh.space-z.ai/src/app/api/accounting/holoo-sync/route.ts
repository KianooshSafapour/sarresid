import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { logAudit, logHistory } from '@/lib/audit'
import { toJalaali } from '@/lib/jalaali-core'
import { readHolooConfig } from '@/lib/holoo'

/** POST /api/accounting/holoo-sync { orderId } — simulated Holoo ERP bridge.
 *  Validates the order, issues a Holoo document reference, and completes the
 *  TO_HOLOO→DONE lifecycle in one shot (also accepts INSPECTED straight from queue).
 *  Gate: ACCOUNTING
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.ACCOUNTING))
    return Response.json({ error: 'فقط حسابدار اجازهٔ ثبت در هلو را دارد' }, { status: 403 })

  const body = (await req.json().catch(() => null)) as { orderId?: string } | null
  if (!body?.orderId) return Response.json({ error: 'شناسه سفارش الزامی است' }, { status: 400 })

  const order = await db.order.findUnique({ where: { id: body.orderId }, include: { supplier: true, items: true } })
  if (!order) return Response.json({ error: 'سفارش یافت نشد' }, { status: 404 })
  if (!['INSPECTED', 'TO_HOLOO'].includes(order.status))
    return Response.json({ error: 'سفارش باید کنترل انبار شده باشد' }, { status: 400 })

  // in LIVE mode a configured endpoint is mandatory — SIMULATED works out of the box
  const cfg = await readHolooConfig()
  if (cfg.mode === 'LIVE' && !cfg.endpoint)
    return Response.json({ error: 'پل در حالت زنده است ولی نشانی سرور هلو ثبت نشده — پیکربندی را کامل کنید' }, { status: 400 })

  // simulate the bridge handshake latency
  await new Promise((r) => setTimeout(r, 350 + Math.floor(Math.random() * 500)))

  // Holoo-style document number: H-YYMM-NNNN (Jalali)
  const t = new Date(Date.now() + 3.5 * 3600000)
  const { jy, jm } = toJalaali(t.getFullYear(), t.getMonth() + 1, t.getDate())
  const docSeq = 1000 + Math.floor(Math.random() * 9000)
  const holooRef = `H-${String(jy).slice(2)}${String(jm).padStart(2, '0')}-${docSeq}`

  await db.order.update({
    where: { id: order.id },
    data: { status: 'DONE', doneAt: new Date(), doneById: session.id, exportedAt: order.exportedAt || new Date(), holooRef },
  })

  // remember the last sync on the bridge setting
  const bridgeRow = await db.setting.findUnique({ where: { key: 'holoo_bridge' } })
  const bridge = bridgeRow ? JSON.parse(bridgeRow.value) : {}
  const bridgeValue = JSON.stringify({ ...bridge, lastSyncAt: new Date().toISOString(), lastSyncRef: holooRef })
  await db.setting.upsert({
    where: { key: 'holoo_bridge' },
    update: { value: bridgeValue },
    create: { key: 'holoo_bridge', value: bridgeValue },
  })

  await logHistory('ORDER', order.id, session.id, session.name, 'ثبت در هلو (پل ارتباطی)', {
    number: order.number,
    supplier: order.supplier.name,
    finalAmount: order.finalAmount,
    holooRef,
    itemCount: order.items.length,
  })
  await logAudit(session.id, session.name, 'HOLOO_SYNC', 'ORDER', order.id, { number: order.number, holooRef })

  return Response.json({
    ok: true,
    holooRef,
    status: 'DONE',
    mode: cfg.mode,
    itemCount: order.items.length,
    finalAmount: order.finalAmount,
    orderNumber: order.number,
  })
}
