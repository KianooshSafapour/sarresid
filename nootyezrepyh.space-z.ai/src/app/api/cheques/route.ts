import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { logAudit, logHistory } from '@/lib/audit'
import { canUser, PERMISSIONS } from '@/lib/constants'

export const dynamic = 'force-dynamic'

const FOLLOW_UP_DAYS = 7
const FOLLOW_UP_MS = FOLLOW_UP_DAYS * 24 * 3600 * 1000

/** Cheques waiting to be handed over for more than 7 days need follow-up */
function needsFollowUp(c: { status: string; writtenAt: Date | null; updatedAt: Date }): boolean {
  if (!['WRITTEN', 'SIGNED', 'READY'].includes(c.status)) return false
  const base = c.writtenAt || c.updatedAt
  return Date.now() - new Date(base).getTime() > FOLLOW_UP_MS
}

// GET /api/cheques?statuses=PENDING_OWNER,WRITTEN&from=1404/08/01&to=1404/08/30&q=نماینده
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.VIEW_CHEQUES)) { // read-level: MANAGE/APPROVE/ACCOUNTING/VIEW all imply read
    return Response.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  }
  const sp = new URL(req.url).searchParams
  const statuses = sp.get('statuses')?.split(',').filter(Boolean)
  const from = sp.get('from')
  const to = sp.get('to')
  const q = sp.get('q')?.trim()
  const orderId = sp.get('orderId')

  const where: Record<string, unknown> = {}
  if (statuses?.length) where.status = { in: statuses }
  if (orderId) where.orderId = orderId
  if (from || to) {
    where.dueDate = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) }
  }
  if (q) {
    where.OR = [
      { payeeName: { contains: q } },
      { payeePhone: { contains: q } },
      { purpose: { contains: q } },
    ]
  }

  const cheques = await db.cheque.findMany({
    where,
    include: { order: { select: { number: true, supplier: { select: { name: true } } } } },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    take: 300,
  })

  return Response.json(
    cheques.map((c) => ({
      id: c.id,
      number: c.number,
      amount: c.amount,
      dueDate: c.dueDate,
      status: c.status,
      payeeName: c.payeeName,
      payeePhone: c.payeePhone,
      purpose: c.purpose,
      orderId: c.orderId,
      orderNumber: c.order?.number ?? null,
      supplierName: c.order?.supplier?.name ?? null,
      writtenAt: c.writtenAt,
      collectedAt: c.collectedAt,
      createdAt: c.createdAt,
      followUpNeeded: needsFollowUp(c),
    }))
  )
}

// POST /api/cheques  { amount, dueDate, purpose?, payeeName?, payeePhone?, orderId?, number? }
export async function POST(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.MANAGE_CHEQUES) && !canUser(session.roles, PERMISSIONS.APPROVE_CHEQUES)) {
    return Response.json({ error: 'فقط مدیر فروشگاه یا حسابدار می‌تواند چک ثبت کند' }, { status: 403 })
  }
  const body = await req.json().catch(() => null)
  const amount = Number(body?.amount)
  const dueDate = String(body?.dueDate || '')
  if (!amount || amount <= 0) return Response.json({ error: 'مبلغ چک معتبر نیست' }, { status: 400 })
  if (!/^\d{4}\/\d{2}\/\d{2}$/.test(dueDate)) return Response.json({ error: 'تاریخ سررسید الزامی است' }, { status: 400 })

  let orderId: string | null = null
  if (body?.orderId) {
    const order = await db.order.findUnique({ where: { id: String(body.orderId) } })
    if (!order) return Response.json({ error: 'سفارش مرتبط یافت نشد' }, { status: 400 })
    if (!['APPROVED', 'EXPECTED'].includes(order.status)) {
      return Response.json({ error: 'سفارش انتخابی در وضعیت معتبر برای چک نیست' }, { status: 400 })
    }
    orderId = order.id
  }

  const cheque = await db.cheque.create({
    data: {
      amount,
      dueDate,
      status: 'PENDING_OWNER',
      purpose: body?.purpose ? String(body.purpose) : null,
      payeeName: body?.payeeName ? String(body.payeeName) : null,
      payeePhone: body?.payeePhone ? String(body.payeePhone) : null,
      number: body?.number ? String(body.number) : null,
      orderId,
      createdById: session.id,
    },
  })

  await logAudit(session.id, session.name, 'CHEQUE_CREATE', 'CHEQUE', cheque.id, { amount, dueDate, payeeName: body?.payeeName })
  await logHistory('CHEQUE', cheque.id, session.id, session.name, 'ثبت چک جدید', {
    amount,
    dueDate,
    status: 'PENDING_OWNER',
    payeeName: body?.payeeName || null,
    purpose: body?.purpose || null,
  })
  return Response.json({ id: cheque.id })
}
