import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { logAudit, logHistory } from '@/lib/audit'
import { canUser, PERMISSIONS } from '@/lib/constants'

export const dynamic = 'force-dynamic'

async function loadCheque(id: string) {
  return db.cheque.findUnique({
    where: { id },
    include: {
      order: { select: { number: true, supplier: { select: { name: true } }, finalAmount: true, totalAmount: true } },
    },
  })
}

// GET /api/cheques/[id] → cheque detail + CHEQUE_HISTORY timeline
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.VIEW_CHEQUES)) { // read-level: MANAGE/APPROVE/ACCOUNTING/VIEW all imply read
    return Response.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
  }
  const { id } = await params
  const cheque = await loadCheque(id)
  if (!cheque) return Response.json({ error: 'چک یافت نشد' }, { status: 404 })
  const creator = await db.user.findUnique({ where: { id: cheque.createdById }, select: { name: true } })
  const history = await db.auditLog.findMany({
    where: { entityType: 'CHEQUE_HISTORY', entityId: id },
    orderBy: { createdAt: 'asc' },
    take: 100,
  })
  return Response.json({ cheque: { ...cheque, createdBy: creator }, history })
}

// PATCH /api/cheques/[id]
// body: { action: 'write'|'sign'|'ready'|'collect'|'done'|'reject'|'reschedule'|'split', ... }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const action = String(body?.action || '')
  const cheque = await loadCheque(id)
  if (!cheque) return Response.json({ error: 'چک یافت نشد' }, { status: 404 })

  const isOwner = canUser(session.roles, PERMISSIONS.APPROVE_CHEQUES)
  const isManager = canUser(session.roles, PERMISSIONS.MANAGE_CHEQUES)
  const isAccountant = canUser(session.roles, PERMISSIONS.ACCOUNTING)

  const now = new Date()
  let updated: unknown = null
  let newStatus: string | null = null

  switch (action) {
    case 'write': {
      // Owner issues the physical cheque; may fix amount/due date just before writing
      if (!isOwner) return Response.json({ error: 'فقط مالک می‌تواند چک را صادر کند' }, { status: 403 })
      if (cheque.status !== 'PENDING_OWNER') return Response.json({ error: 'این چک در وضعیت قابل صدور نیست' }, { status: 400 })
      const data: Record<string, unknown> = { status: 'WRITTEN', writtenAt: now }
      if (body?.amount) data.amount = Number(body.amount)
      if (body?.dueDate) data.dueDate = String(body.dueDate)
      updated = await db.cheque.update({ where: { id }, data, include: { order: { select: { number: true } } } })
      newStatus = 'WRITTEN'
      await logHistory('CHEQUE', id, session.id, session.name, 'چک صادر شد ✍️', {
        from: cheque.status,
        to: 'WRITTEN',
        amount: Number(data.amount ?? cheque.amount),
        dueDate: String(data.dueDate ?? cheque.dueDate),
      })
      break
    }
    case 'sign': {
      if (!isOwner) return Response.json({ error: 'فقط مالک می‌تواند چک را امضا کند' }, { status: 403 })
      if (cheque.status !== 'WRITTEN') return Response.json({ error: 'برای امضا، چک باید صادر شده باشد' }, { status: 400 })
      updated = await db.cheque.update({ where: { id }, data: { status: 'SIGNED' } })
      newStatus = 'SIGNED'
      await logHistory('CHEQUE', id, session.id, session.name, 'چک امضا شد', { from: 'WRITTEN', to: 'SIGNED' })
      break
    }
    case 'ready': {
      if (!isOwner) return Response.json({ error: 'فقط مالک می‌تواند چک را آماده تحویل کند' }, { status: 403 })
      if (!['SIGNED', 'WRITTEN'].includes(cheque.status)) return Response.json({ error: 'وضعیت چک برای آماده‌سازی معتبر نیست' }, { status: 400 })
      updated = await db.cheque.update({ where: { id }, data: { status: 'READY' } })
      newStatus = 'READY'
      await logHistory('CHEQUE', id, session.id, session.name, 'چک آماده تحویل شد', { from: cheque.status, to: 'READY' })
      break
    }
    case 'collect': {
      if (!isManager) return Response.json({ error: 'فقط مدیر فروشگاه می‌تواند چک را تحویل دهد' }, { status: 403 })
      if (!['READY', 'SIGNED', 'WRITTEN'].includes(cheque.status)) return Response.json({ error: 'وضعیت چک برای تحویل معتبر نیست' }, { status: 400 })
      const data: Record<string, unknown> = { status: 'COLLECTED', collectedAt: now }
      if (body?.payeeName) data.payeeName = String(body.payeeName)
      if (body?.payeePhone) data.payeePhone = String(body.payeePhone)
      updated = await db.cheque.update({ where: { id }, data })
      newStatus = 'COLLECTED'
      await logHistory('CHEQUE', id, session.id, session.name, 'چک تحویل نماینده شد', {
        from: cheque.status,
        to: 'COLLECTED',
        payeeName: body?.payeeName || cheque.payeeName,
        payeePhone: body?.payeePhone || cheque.payeePhone,
      })
      break
    }
    case 'done': {
      if (!isAccountant && !isManager && !isOwner) return Response.json({ error: 'فقط حسابدار یا مدیر می‌تواند پاس شدن را تأیید کند' }, { status: 403 })
      if (!['COLLECTED', 'READY'].includes(cheque.status)) return Response.json({ error: 'برای پاس شدن، چک باید تحویل شده باشد' }, { status: 400 })
      updated = await db.cheque.update({ where: { id }, data: { status: 'DONE' } })
      newStatus = 'DONE'
      await logHistory('CHEQUE', id, session.id, session.name, 'چک پاس شد ✅', { from: cheque.status, to: 'DONE' })
      break
    }
    case 'reject': {
      if (!isOwner) return Response.json({ error: 'فقط مالک می‌تواند چک را رد کند' }, { status: 403 })
      if (['DONE', 'COLLECTED'].includes(cheque.status)) return Response.json({ error: 'چک تحویل‌شده قابل رد شدن نیست' }, { status: 400 })
      updated = await db.cheque.update({ where: { id }, data: { status: 'REJECTED' } })
      newStatus = 'REJECTED'
      await logHistory('CHEQUE', id, session.id, session.name, 'چک رد شد', {
        from: cheque.status,
        to: 'REJECTED',
        note: body?.note ? String(body.note) : null,
      })
      break
    }
    case 'reschedule': {
      if (!isManager && !isOwner) return Response.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
      const dueDate = body?.dueDate ? String(body.dueDate) : ''
      const amount = body?.amount !== undefined && body?.amount !== null && body.amount !== '' ? Number(body.amount) : null
      if (!dueDate && !amount) return Response.json({ error: 'تاریخ یا مبلغ جدید را وارد کنید' }, { status: 400 })
      if (['DONE', 'REJECTED'].includes(cheque.status)) return Response.json({ error: 'این چک قابل ویرایش نیست' }, { status: 400 })
      const data: Record<string, unknown> = {}
      if (dueDate) data.dueDate = dueDate
      if (amount && amount > 0) data.amount = amount
      updated = await db.cheque.update({ where: { id }, data })
      newStatus = cheque.status
      await logHistory('CHEQUE', id, session.id, session.name, 'ویرایش چک', {
        dueDate: dueDate || cheque.dueDate,
        amount: amount || cheque.amount,
        previous: { dueDate: cheque.dueDate, amount: cheque.amount },
      })
      break
    }
    case 'split': {
      if (!isOwner) return Response.json({ error: 'فقط مالک می‌تواند چک را تقسیم کند' }, { status: 403 })
      if (['DONE', 'COLLECTED', 'REJECTED'].includes(cheque.status)) return Response.json({ error: 'این چک قابل تقسیم نیست' }, { status: 400 })
      const parts = Array.isArray(body?.split) ? body.split : []
      const clean = parts
        .map((p: { amount?: unknown; dueDate?: unknown }) => ({ amount: Number(p?.amount), dueDate: String(p?.dueDate || '') }))
        .filter((p: { amount: number; dueDate: string }) => p.amount > 0 && /^\d{4}\/\d{2}\/\d{2}$/.test(p.dueDate))
      if (clean.length < 2) return Response.json({ error: 'حداقل دو چک برای تقسیم لازم است' }, { status: 400 })
      const created: string[] = []
      for (const p of clean) {
        const c = await db.cheque.create({
          data: {
            amount: p.amount,
            dueDate: p.dueDate,
            status: 'PENDING_OWNER',
            payeeName: cheque.payeeName,
            payeePhone: cheque.payeePhone,
            purpose: cheque.purpose ? `${cheque.purpose} (حاصل تقسیم چک)` : 'حاصل تقسیم چک',
            orderId: cheque.orderId,
            createdById: session.id,
          },
        })
        created.push(c.id)
        await logHistory('CHEQUE', c.id, session.id, session.name, 'ثبت چک جدید (حاصل تقسیم)', {
          amount: p.amount,
          dueDate: p.dueDate,
          status: 'PENDING_OWNER',
          splitFrom: id,
        })
      }
      updated = await db.cheque.update({ where: { id }, data: { status: 'REJECTED' } })
      newStatus = 'REJECTED'
      await logHistory('CHEQUE', id, session.id, session.name, 'چک تقسیم شد', {
        from: cheque.status,
        to: 'REJECTED',
        note: 'تقسیم شد',
        parts: clean,
        createdIds: created,
      })
      await logAudit(session.id, session.name, 'CHEQUE_SPLIT', 'CHEQUE', id, { parts: clean, createdIds: created })
      break
    }
    default:
      return Response.json({ error: 'عملیات نامعتبر است' }, { status: 400 })
  }

  await logAudit(session.id, session.name, `CHEQUE_${action.toUpperCase()}`, 'CHEQUE', id, {
    action,
    to: newStatus,
  })
  return Response.json({ ok: true, cheque: updated })
}
