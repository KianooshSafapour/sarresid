import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, logActivity, notifyRoles } from '@/lib/server-utils'
import { isoDay, pad2, toJalali } from '@/lib/jalali'
import { isFriday, prevOpenDay, loadHolidaySet, holidayMessage } from './_holiday'

/** CH-14040712-001 — jalali yyyymmdd + daily sequence */
async function nextChequeNumber(): Promise<string> {
  const now = new Date()
  const j = toJalali(now)
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const count = await db.cheque.count({ where: { createdAt: { gte: dayStart } } })
  let seq = count + 1
  for (let i = 0; i < 50; i++) {
    const number = `CH-${j.jy}${pad2(j.jm)}${pad2(j.jd)}-${String(seq).padStart(3, '0')}`
    const exists = await db.cheque.findFirst({ where: { number } })
    if (!exists) return number
    seq++
  }
  return `CH-${j.jy}${pad2(j.jm)}${pad2(j.jd)}-${Date.now().toString().slice(-4)}`
}

// ---------- GET: cheques (filters: status, from/to dueDate, signedBy) ----------
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const signedBy = url.searchParams.get('signedBy')

  const where: Record<string, unknown> = {}
  if (status && status !== 'ALL') where.status = status
  if (from || to) {
    const range: Record<string, string> = {}
    if (from) range.gte = from
    if (to) range.lte = to
    where.dueDate = range
  }
  if (signedBy === 'me') where.signedById = user.id

  const cheques = await db.cheque.findMany({
    where,
    orderBy: { dueDate: 'asc' },
    take: 500,
    include: { order: { select: { code: true } } },
  })

  return ok(
    cheques.map((c) => ({
      id: c.id,
      number: c.number,
      amount: c.amount,
      dueDate: c.dueDate,
      issueDate: c.issueDate,
      payeeName: c.payeeName,
      payeePhone: c.payeePhone,
      orderId: c.orderId,
      isForOrder: c.isForOrder,
      status: c.status,
      note: c.note,
      writtenAt: c.writtenAt,
      collectedAt: c.collectedAt,
      givenTo: c.givenTo,
      signedById: c.signedById,
      orderCode: c.order?.code ?? null,
    }))
  )
}

// ---------- POST: create cheque (gm / om / owner / accountant + managers) ----------
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!['gm', 'om', 'owner', 'accountant'].some((k) => user.roleKeys.includes(k)) && !user.isManager)
    return fail('اجازه صدور چک را ندارید', 403)

  const body = (await req.json()) as {
    amount?: number
    payeeName?: string
    payeePhone?: string
    dueDate?: string
    orderId?: string | null
    isForOrder?: boolean
    note?: string
  }

  const amount = Number(body.amount ?? 0)
  if (!amount || amount <= 0) return fail('مبلغ چک لازم است')
  if (!body.payeeName?.trim()) return fail('نام گیرنده لازم است')
  if (!body.dueDate) return fail('تاریخ سررسید لازم است')

  const due = new Date(new Date(body.dueDate).getFullYear(), new Date(body.dueDate).getMonth(), new Date(body.dueDate).getDate())
  const holidays = await loadHolidaySet(due)
  if (isFriday(due) || holidays.has(isoDay(due))) {
    return fail(holidayMessage(prevOpenDay(due, holidays)))
  }

  let orderId: string | null = null
  let isForOrder = Boolean(body.isForOrder)
  if (body.orderId) {
    const o = await db.order.findUnique({ where: { id: body.orderId }, select: { id: true, code: true } })
    if (!o) return fail('سفارش انتخابی یافت نشد')
    orderId = o.id
    isForOrder = true
  }

  const number = await nextChequeNumber()
  const cheque = await db.cheque.create({
    data: {
      number,
      amount,
      dueDate: due,
      payeeName: body.payeeName.trim(),
      payeePhone: body.payeePhone?.trim() || null,
      orderId,
      isForOrder,
      status: 'PENDING_OWNER',
      note: body.note?.trim() || null,
      createdById: user.id,
    },
  })

  await logActivity(user.id, user.name, 'صدور چک', 'Cheque', cheque.id, `${number} — ${amount.toLocaleString('fa-IR')} تومان به ${body.payeeName}`)
  await notifyRoles(['owner'], 'چک جدید در انتظار امضا', `${number} به مبلغ ${amount.toLocaleString('fa-IR')} تومان برای ${body.payeeName} صادر شد.`, 'INFO', 'payments', user.id)

  return ok({ success: true, cheque })
}

// ---------- PATCH: status transitions ----------
export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)

  const body = (await req.json()) as { id?: string; status?: string; note?: string; givenTo?: string }
  if (!body.id || !body.status) return fail('شناسه و وضعیت لازم است')

  const cheque = await db.cheque.findUnique({ where: { id: body.id } })
  if (!cheque) return fail('چک یافت نشد', 404)

  const isOwner = user.roleKeys.includes('owner')
  const isGmTeam = ['gm', 'om'].some((k) => user.roleKeys.includes(k)) || user.isManager

  const data: Record<string, unknown> = { status: body.status }
  let activity = ''

  switch (body.status) {
    case 'SIGNED': {
      if (cheque.status !== 'PENDING_OWNER') return fail('فقط چک در انتظار امضا قابل تأیید است')
      if (!isOwner) return fail('امضا فقط توسط مالک انجام می‌شود', 403)
      data.writtenAt = new Date()
      data.signedById = user.id
      if (body.note) data.note = body.note
      activity = 'امضا و تأیید چک'
      break
    }
    case 'REJECTED': {
      if (!['PENDING_OWNER', 'SIGNED'].includes(cheque.status)) return fail('این چک در مرحله رد شدن نیست')
      if (!isOwner && cheque.status === 'PENDING_OWNER') return fail('رد چکِ در انتظار امضا فقط توسط مالک انجام می‌شود', 403)
      if (!isGmTeam && cheque.status === 'SIGNED') return fail('اجازه رد این چک را ندارید', 403)
      data.note = body.note?.trim() || cheque.note
      activity = 'رد چک'
      break
    }
    case 'DELIVERED': {
      if (cheque.status !== 'SIGNED') return fail('فقط چک امضاشده قابل تحویل است')
      if (!isGmTeam) return fail('اجازه ثبت تحویل چک را ندارید', 403)
      data.givenTo = body.givenTo?.trim() || null
      activity = 'تحویل چک به نماینده'
      break
    }
    case 'COLLECTED': {
      if (!['DELIVERED', 'SIGNED'].includes(cheque.status)) return fail('این چک قابل وصول نیست')
      if (!isGmTeam) return fail('اجازه ثبت وصول را ندارید', 403)
      data.collectedAt = new Date()
      activity = 'وصول چک'
      break
    }
    case 'UNCOLLECTED_REPORTED': {
      if (!['SIGNED', 'DELIVERED', 'COLLECTED'].includes(cheque.status)) return fail('این وضعیت برای چک جاری معتبر نیست')
      if (!isGmTeam) return fail('اجازه پیگیری چک را ندارید', 403)
      data.note = body.note?.trim() || cheque.note
      activity = 'پیگیری عدم دریافت چک'
      break
    }
    case 'CLEARED': {
      if (cheque.status !== 'COLLECTED') return fail('فقط چک وصول‌شده تسویه‌شده می‌شود')
      if (!isGmTeam) return fail('اجازه ثبت تسویه را ندارید', 403)
      activity = 'تسویه چک'
      break
    }
    default:
      return fail('انتقال وضعیت نامعتبر')
  }

  const updated = await db.cheque.update({ where: { id: cheque.id }, data })

  if (body.status === 'UNCOLLECTED_REPORTED') {
    await notifyRoles(['gm', 'owner'], 'چک دریافت نشده — نیازمند پیگیری', `چک ${cheque.number} به مبلغ ${cheque.amount.toLocaleString('fa-IR')} تومان در سررسید تحویل نشد.`, 'WARNING', 'payments', user.id)
  }
  if (body.status === 'SIGNED') {
    await notifyRoles(['gm', 'om'], 'چک امضا شد — آماده تحویل', `چک ${cheque.number} توسط مالک امضا شد و آماده تحویل به نماینده است.`, 'INFO', 'payments', user.id)
  }
  await logActivity(user.id, user.name, activity || 'تغییر وضعیت چک', 'Cheque', cheque.id, `${cheque.number} → ${body.status}`)

  return ok({ success: true, cheque: updated })
}
