import { db } from '@/lib/db'
import { appendHistory, fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'
import { canViewApi, hasCap } from '@/lib/rbac'
import { isExecRole } from '@/lib/constants'
import { jMonthLength, jalaliToIso, toJalaliParts, todayIso } from '@/lib/jalali'

const KINDS = ['CASH', 'POS', 'TRANSFER', 'OTHER']
const KIND_LABELS: Record<string, string> = { CASH: 'نقدی', POS: 'کارت‌خوان', TRANSFER: 'کارت به کارت / حواله', OTHER: 'سایر' }

/** ثبت/ویرایش پرداخت: مدیران اجرایی، حسابدار (cap cheques.create) یا مدیران مالی */
async function canManage(me: { role: string; secondaryRoles: string[]; roleIds?: string } | null): Promise<boolean> {
  if (!me) return false
  if (isExecRole(me.role)) return true
  return hasCap(me as never, 'cheques.create')
}

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canViewApi(me, 'cheques'))) return fail('دسترسی به بخش چک‌ها را ندارید', 403)

  const payments = await db.payment.findMany({ orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }] })

  const today = todayIso()
  // بازهٔ ماه شمسی جاری
  const parts = toJalaliParts(today)
  const monthStart = jalaliToIso(parts.jy, parts.jm, 1)
  const monthEnd = jalaliToIso(parts.jy, parts.jm, jMonthLength(parts.jy, parts.jm))

  const byKind: Record<string, { count: number; amount: number }> = {}
  let total = 0
  let todayAmount = 0
  let todayCount = 0
  let monthAmount = 0
  let monthCount = 0
  for (const p of payments) {
    const day = String(p.paidAt).slice(0, 10)
    total += p.amount
    const k = (byKind[p.kind] ||= { count: 0, amount: 0 })
    k.count++
    k.amount += p.amount
    if (day === today) {
      todayAmount += p.amount
      todayCount++
    }
    if (day >= monthStart && day <= monthEnd) {
      monthAmount += p.amount
      monthCount++
    }
  }

  return json({
    payments: payments.map((p) => ({ ...p, history: JSON.parse(p.history || '[]') })),
    stats: {
      count: payments.length,
      total,
      today: { count: todayCount, amount: todayAmount },
      month: { count: monthCount, amount: monthAmount },
      byKind,
    },
  })
}

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canManage(me))) return fail('ثبت پرداخت نیاز به دسترسی مالی دارد', 403)
  const body = await req.json().catch(() => ({}))

  const kind = String(body.kind || 'CASH')
  if (!KINDS.includes(kind)) return fail('روش پرداخت نامعتبر است')
  const amount = Number(body.amount)
  if (!amount || amount <= 0) return fail('مبلغ پرداخت الزامی است')
  const paidAt = String(body.paidAt || todayIso()).slice(0, 10)

  const payment = await db.payment.create({
    data: {
      kind,
      amount,
      orderId: String(body.orderId || ''),
      orderCode: String(body.orderCode || ''),
      providerName: String(body.providerName || '').slice(0, 120),
      repId: String(body.repId || ''),
      repName: String(body.repName || '').slice(0, 120),
      paidAt,
      holooReceiptNo: String(body.holooReceiptNo || '').slice(0, 60),
      note: String(body.note || '').slice(0, 400),
      createdById: me.id,
      createdByName: me.name,
      history: JSON.stringify([
        {
          at: new Date().toISOString(),
          userId: me.id,
          userName: me.name,
          action: 'ثبت پرداخت',
          detail: `${KIND_LABELS[kind]} — ${body.orderCode ? `سفارش ${body.orderCode}` : 'مستقل'}`,
        },
      ]),
    },
  })
  await logActivity(me, 'ثبت پرداخت مستقل', 'payment', payment.id, `${KIND_LABELS[kind]} ${payment.providerName || ''}`)
  return json({ payment: { ...payment, history: JSON.parse(payment.history) } }, 201)
}

export async function PATCH(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canManage(me))) return fail('ویرایش پرداخت نیاز به دسترسی مالی دارد', 403)
  const body = await req.json().catch(() => ({}))
  const id = String(body.id || '')
  if (!id) return fail('شناسهٔ پرداخت الزامی است')
  const payment = await db.payment.findUnique({ where: { id } })
  if (!payment) return fail('پرداخت یافت نشد', 404)

  const data: Record<string, unknown> = {}
  const changes: string[] = []
  const fields: [string, (v: unknown) => unknown][] = [
    ['kind', (v) => (KINDS.includes(String(v)) ? String(v) : payment.kind)],
    ['amount', (v) => (Number(v) > 0 ? Number(v) : payment.amount)],
    ['providerName', (v) => String(v ?? '').slice(0, 120)],
    ['repId', (v) => String(v ?? '')],
    ['repName', (v) => String(v ?? '').slice(0, 120)],
    ['paidAt', (v) => String(v ?? payment.paidAt).slice(0, 10)],
    ['holooReceiptNo', (v) => String(v ?? '').slice(0, 60)],
    ['note', (v) => String(v ?? '').slice(0, 400)],
    ['orderCode', (v) => String(v ?? '')],
    ['orderId', (v) => String(v ?? '')],
  ]
  for (const [key, norm] of fields) {
    if (body[key] === undefined) continue
    const next = norm(body[key])
    if (next !== (payment as unknown as Record<string, unknown>)[key]) {
      data[key] = next
      changes.push(`${key}: ${String((payment as unknown as Record<string, unknown>)[key] ?? '')} ← ${String(next)}`)
    }
  }
  if (!Object.keys(data).length) return json({ payment: { ...payment, history: JSON.parse(payment.history || '[]') }, unchanged: true })

  const updated = await db.payment.update({
    where: { id },
    data: { ...data, history: appendHistory(payment.history, { userId: me.id, userName: me.name, action: 'ویرایش پرداخت', detail: changes.join(' | ').slice(0, 300) }) },
  })
  await logActivity(me, 'ویرایش پرداخت', 'payment', id, changes.join(' | ').slice(0, 120))
  return json({ payment: { ...updated, history: JSON.parse(updated.history || '[]') } })
}

export async function DELETE(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return fail('شناسهٔ پرداخت الزامی است')
  const payment = await db.payment.findUnique({ where: { id } })
  if (!payment) return fail('پرداخت یافت نشد', 404)
  // فقط ثبت‌کنندهٔ همان رکورد یا مدیران اجرایی
  if (payment.createdById !== me.id && !isExecRole(me.role)) return fail('فقط ثبت‌کننده یا مدیران اجرایی می‌توانند حذف کنند', 403)
  await db.payment.delete({ where: { id } })
  await logActivity(me, 'حذف پرداخت', 'payment', id, `${payment.kind} ${payment.providerName || ''}`)
  return json({ ok: true })
}
