import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, logActivity } from '@/lib/server-utils'
import { addDays } from '@/lib/jalali'

// ---------- GET: payments list + meta (today count, week total) ----------
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)

  const url = new URL(req.url)
  const take = Number(url.searchParams.get('take') ?? 100)
  const dayStart = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())
  const weekAgo = addDays(dayStart, -6)

  const [payments, todayCount, weekAgg] = await Promise.all([
    db.payment.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 300),
      include: { order: { select: { code: true } } },
    }),
    db.payment.count({ where: { createdAt: { gte: dayStart } } }),
    db.payment.aggregate({ _sum: { amount: true }, where: { createdAt: { gte: weekAgo } } }),
  ])

  // registrar names (no relation on Payment — resolve via lookup)
  const userIds = Array.from(new Set(payments.map((p) => p.userId).filter(Boolean))) as string[]
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, color: true } })
    : []
  const userById = new Map(users.map((u) => [u.id, u]))

  return ok({
    payments: payments.map((p) => ({
      id: p.id,
      orderId: p.orderId,
      orderCode: p.order?.code ?? null,
      amount: p.amount,
      type: p.type,
      receiptNo: p.receiptNo,
      posReceiptNo: p.posReceiptNo,
      note: p.note,
      userName: (p.userId ? userById.get(p.userId)?.name : null) ?? '—',
      userColor: (p.userId ? userById.get(p.userId)?.color : null) ?? '#8A8F98',
      createdAt: p.createdAt,
    })),
    meta: {
      todayCount,
      weekTotal: weekAgg._sum.amount ?? 0,
    },
  })
}

// ---------- POST: create payment (accountant + managers) ----------
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!user.isManager && !user.roleKeys.includes('accountant')) return fail('اجازه ثبت پرداخت را ندارید', 403)

  const body = (await req.json()) as {
    orderId?: string | null
    amount?: number
    type?: string
    receiptNo?: string
    posReceiptNo?: string
    note?: string
  }

  const amount = Number(body.amount ?? 0)
  if (!amount || amount <= 0) return fail('مبلغ پرداخت لازم است')

  const type = ['CASH_ON_DELIVERY', 'CHEQUE', 'TRANSFER', 'OTHER'].includes(body.type ?? '')
    ? (body.type as string)
    : 'CASH_ON_DELIVERY'

  const payment = await db.payment.create({
    data: {
      orderId: body.orderId || null,
      amount,
      type,
      receiptNo: body.receiptNo?.trim() || null,
      posReceiptNo: body.posReceiptNo?.trim() || null,
      note: body.note?.trim() || null,
      userId: user.id,
    },
  })

  await logActivity(user.id, user.name, 'ثبت پرداخت', 'Payment', payment.id, `${amount.toLocaleString('fa-IR')} تومان (${type})`)
  return ok({ success: true, payment })
}
