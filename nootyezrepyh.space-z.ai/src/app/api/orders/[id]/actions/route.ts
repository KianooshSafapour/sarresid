import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { logAudit, logHistory } from '@/lib/audit'
import { canUser, PERMISSIONS, ORDER_STATUSES } from '@/lib/constants'

/**
 * POST /api/orders/[id]/actions — order workflow actions
 * Body: { action: 'submit' | 'approve' | 'reject' | 'expect' | 'correction', note?: string }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  const { id } = await params

  const body = await req.json().catch(() => null)
  const action = (body as { action?: string })?.action
  const note = (body as { note?: string })?.note

  const order = await db.order.findUnique({ where: { id }, include: { supplier: { select: { name: true } } } })
  if (!order) return Response.json({ error: 'سفارش یافت نشد' }, { status: 404 })

  const statusLabel = (s: string) => ORDER_STATUSES[s]?.label || s

  // ---- ارسال برای تأیید: DRAFT → PENDING_APPROVAL ----
  if (action === 'submit') {
    if (!canUser(session.roles, PERMISSIONS.MANAGE_ORDERS))
      return Response.json({ error: 'شما اجازه انجام این کار را ندارید' }, { status: 403 })
    if (order.status !== 'DRAFT')
      return Response.json({ error: 'فقط سفارش‌های پیش‌نویس قابل ارسال برای تأیید هستند' }, { status: 400 })
    await db.order.update({ where: { id }, data: { status: 'PENDING_APPROVAL' } })
    await logAudit(session.id, session.name, 'SUBMIT_ORDER', 'ORDER', id, { number: order.number })
    await logHistory('ORDER', id, session.id, session.name, 'ارسال برای تأیید', {
      fromStatus: 'DRAFT',
      toStatus: 'PENDING_APPROVAL',
      description: `سفارش «${order.supplier.name}» برای تأیید مدیر فروشگاه ارسال شد${note ? ` — ${note}` : ''}`,
    })
    return Response.json({ ok: true, status: 'PENDING_APPROVAL' })
  }

  // ---- تأیید سفارش: PENDING_APPROVAL → APPROVED ----
  if (action === 'approve') {
    if (!canUser(session.roles, PERMISSIONS.APPROVE_ORDERS))
      return Response.json({ error: 'تأیید سفارش فقط توسط مدیر فروشگاه / مدیر عملیات امکان‌پذیر است' }, { status: 403 })
    if (order.status !== 'PENDING_APPROVAL')
      return Response.json({ error: 'این سفارش در وضعیت انتظار تأیید نیست' }, { status: 400 })
    await db.order.update({ where: { id }, data: { status: 'APPROVED' } })
    await logAudit(session.id, session.name, 'APPROVE_ORDER', 'ORDER', id, { number: order.number })
    await logHistory('ORDER', id, session.id, session.name, 'تأیید سفارش', {
      fromStatus: 'PENDING_APPROVAL',
      toStatus: 'APPROVED',
      description: `سفارش «${order.supplier.name}» تأیید شد و به تأمین‌کننده اعلام می‌شود`,
    })
    return Response.json({ ok: true, status: 'APPROVED' })
  }

  // ---- رد و بازگشت برای اصلاح: PENDING_APPROVAL → DRAFT ----
  if (action === 'reject') {
    if (!canUser(session.roles, PERMISSIONS.APPROVE_ORDERS))
      return Response.json({ error: 'رد سفارش فقط توسط مدیر فروشگاه / مدیر عملیات امکان‌پذیر است' }, { status: 403 })
    if (order.status !== 'PENDING_APPROVAL')
      return Response.json({ error: 'این سفارش در وضعیت انتظار تأیید نیست' }, { status: 400 })
    await db.order.update({ where: { id }, data: { status: 'DRAFT' } })
    await logAudit(session.id, session.name, 'REJECT_ORDER', 'ORDER', id, { number: order.number, note })
    await logHistory('ORDER', id, session.id, session.name, 'رد و بازگشت سفارش', {
      fromStatus: 'PENDING_APPROVAL',
      toStatus: 'DRAFT',
      description: note ? `سفارش رد و برای اصلاح بازگشت — دلیل: ${note}` : 'سفارش رد و برای اصلاح بازگشت به پیش‌نویس',
    })
    return Response.json({ ok: true, status: 'DRAFT' })
  }

  // ---- ثبت و انتظار دریافت: APPROVED → EXPECTED ----
  if (action === 'expect') {
    if (!canUser(session.roles, PERMISSIONS.APPROVE_ORDERS))
      return Response.json({ error: 'این کار فقط توسط مدیر فروشگاه / مدیر عملیات امکان‌پذیر است' }, { status: 403 })
    if (order.status !== 'APPROVED')
      return Response.json({ error: 'فقط سفارش‌های تأییدشده به وضعیت انتظار دریافت می‌روند' }, { status: 400 })
    await db.order.update({ where: { id }, data: { status: 'EXPECTED' } })
    await logAudit(session.id, session.name, 'EXPECT_ORDER', 'ORDER', id, { number: order.number })
    await logHistory('ORDER', id, session.id, session.name, 'ثبت و انتظار دریافت', {
      fromStatus: 'APPROVED',
      toStatus: 'EXPECTED',
      description: `سفارش «${order.supplier.name}» ثبت شد؛ در انتظار دریافت کالا در تاریخ ${order.deliveryDate}`,
    })
    return Response.json({ ok: true, status: 'EXPECTED' })
  }

  // ---- افزودن اصلاحیه: allowed on every non-cancelled status (mainly after lock) ----
  if (action === 'correction') {
    if (!canUser(session.roles, PERMISSIONS.MANAGE_ORDERS))
      return Response.json({ error: 'شما اجازه ثبت اصلاحیه ندارید' }, { status: 403 })
    if (order.status === 'CANCELLED')
      return Response.json({ error: 'برای سفارش لغوشده نمی‌توان اصلاحیه ثبت کرد' }, { status: 400 })
    if (!note || !note.trim())
      return Response.json({ error: 'متن اصلاحیه را وارد کنید' }, { status: 400 })
    await logAudit(session.id, session.name, 'CORRECTION_ORDER', 'ORDER', id, {
      number: order.number,
      note: note.trim(),
    })
    await logHistory('ORDER', id, session.id, session.name, 'افزودن اصلاحیه', {
      fromStatus: order.status,
      toStatus: order.status,
      description: note.trim(),
      isCorrection: true,
    })
    return Response.json({ ok: true })
  }

  return Response.json({ error: `عملیات ناشناخته: ${action || '(خالی)'}` }, { status: 400 })
}
