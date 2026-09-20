import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// ---------- helpers ----------
function isoDate(d: Date | string) {
  return (typeof d === 'string' ? d : d.toISOString()).slice(0, 10)
}

function hasRole(u: { roles: string } | null | undefined, role: string) {
  return !!u && u.roles.split(',').map((s) => s.trim()).includes(role)
}

async function notifyRoles(roles: string[], title: string, body?: string, type = 'INFO', excludeUserId?: number) {
  const users = await db.user.findMany({ where: { active: true }, select: { id: true, roles: true } })
  const targets = users.filter(
    (u) => u.id !== excludeUserId && roles.some((r) => u.roles.split(',').map((s) => s.trim()).includes(r))
  )
  if (targets.length)
    await db.notification.createMany({
      data: targets.map((u) => ({ userId: u.id, title, body: body ?? null, type })),
    })
}

async function audit(
  userId: number | null | undefined,
  action: string,
  entity: string,
  entityId: number | null,
  detail?: string
) {
  let userName = 'سیستم'
  if (userId) {
    const u = await db.user.findUnique({ where: { id: userId }, select: { name: true } })
    if (u) userName = u.name
  }
  await db.auditLog.create({
    data: { userId: userId ?? 0, userName, action, entity, entityId, detail: detail ?? null },
  })
}

const chequeInclude = { order: { select: { code: true } } }

// GET /api/cheques?status= → {cheques: [...include order {code}]}, sorted dueDate asc
export async function GET(request: Request) {
  try {
    const status = new URL(request.url).searchParams.get('status')
    const cheques = await db.cheque.findMany({
      where: status ? { status } : undefined,
      include: chequeInclude,
      orderBy: { dueDate: 'asc' },
    })
    return NextResponse.json({ cheques })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

// POST /api/cheques {orderId?,purpose,amount,dueDate,recipientName?,recipientPhone?,payee?,note?,createdById}
export async function POST(request: Request) {
  try {
    const b = await request.json()
    const amount = Number(b?.amount)
    if (!Number.isFinite(amount) || amount <= 0)
      return NextResponse.json({ error: 'مبلغ چک باید بزرگ‌تر از صفر باشد' }, { status: 400 })
    if (!b?.dueDate) return NextResponse.json({ error: 'تاریخ سررسید الزامی است' }, { status: 400 })
    const dueDate = new Date(b.dueDate)
    if (isNaN(dueDate.getTime())) return NextResponse.json({ error: 'تاریخ سررسید نامعتبر است' }, { status: 400 })

    // holiday check: due date must not fall on a holiday
    const iso = isoDate(dueDate)
    const holiday = await db.holiday.findUnique({ where: { date: iso } })
    if (holiday)
      return NextResponse.json(
        {
          error: 'تاریخ سررسید تعطیل است — due date is a holiday',
          date: holiday.date,
          title: holiday.title,
        },
        { status: 400 }
      )

    const createdById = Number(b?.createdById ?? 0)
    const creator = await db.user.findUnique({ where: { id: createdById }, select: { name: true } })
    const cheque = await db.cheque.create({
      data: {
        orderId: b?.orderId ? Number(b.orderId) : null,
        purpose: b?.purpose ? String(b.purpose) : 'ORDER',
        payee: b?.payee ? String(b.payee) : null,
        amount,
        dueDate,
        recipientName: b?.recipientName ? String(b.recipientName) : null,
        recipientPhone: b?.recipientPhone ? String(b.recipientPhone) : null,
        note: b?.note ? String(b.note) : null,
        status: 'PENDING_APPROVAL',
        createdById,
      },
      include: chequeInclude,
    })
    await notifyRoles(
      ['OWNER'],
      'چک جدید در انتظار تایید',
      `مبلغ ${amount.toLocaleString('fa-IR')} — سررسید ${iso}${creator ? ` — ثبت توسط ${creator.name}` : ''}`,
      'WARNING',
      createdById
    )
    await audit(createdById, 'CHEQUE_CREATE', 'Cheque', cheque.id, `purpose=${cheque.purpose} amount=${amount} due=${iso}`)
    return NextResponse.json({ cheque })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}

// PATCH /api/cheques {id, action, userId, ...}
// actions: approve | reschedule {newDueDate} | write | sign | give {recipientName,recipientPhone}
//        | collect | reject {reason} | bounce | update {note,recipientName,recipientPhone}
export async function PATCH(request: Request) {
  try {
    const b = await request.json()
    const id = Number(b?.id)
    if (!id) return NextResponse.json({ error: 'شناسه چک الزامی است' }, { status: 400 })
    const userId = Number(b?.userId ?? 0)
    const cheque = await db.cheque.findUnique({ where: { id }, include: chequeInclude })
    if (!cheque) return NextResponse.json({ error: 'چک یافت نشد' }, { status: 400 })

    const action = String(b?.action ?? '')
    const now = new Date()
    let data: Record<string, unknown> = {}
    let notify: { roles: string[]; title: string; body?: string; type?: string } | null = null
    let auditAction = 'CHEQUE_UPDATE'
    let detail = ''

    switch (action) {
      case 'approve': {
        const actor = await db.user.findUnique({ where: { id: userId } })
        if (!hasRole(actor, 'OWNER') && !hasRole(actor, 'GENERAL_MANAGER'))
          return NextResponse.json({ error: 'فقط مالک یا مدیرعامل می‌تواند چک را تایید کند' }, { status: 400 })
        if (cheque.status !== 'PENDING_APPROVAL')
          return NextResponse.json({ error: 'این چک در وضعیت انتظار تایید نیست' }, { status: 400 })
        data = { status: 'APPROVED', decidedById: userId, decidedAt: now }
        auditAction = 'CHEQUE_APPROVE'
        detail = `تایید چک مبلغ ${cheque.amount.toLocaleString('fa-IR')} — سررسید ${isoDate(cheque.dueDate)}`
        notify = {
          roles: ['GENERAL_MANAGER'],
          title: 'چک تایید شد',
          body: `چک ${cheque.purpose} به مبلغ ${cheque.amount.toLocaleString('fa-IR')} تایید شد`,
          type: 'SUCCESS',
        }
        break
      }
      case 'reschedule': {
        if (cheque.status !== 'WRITTEN' && cheque.status !== 'SIGNED')
          return NextResponse.json({ error: 'تغییر سررسید فقط برای چک نوشته یا امضاشده مجاز است' }, { status: 400 })
        if (!b?.newDueDate) return NextResponse.json({ error: 'تاریخ جدید الزامی است' }, { status: 400 })
        const nd = new Date(b.newDueDate)
        if (isNaN(nd.getTime())) return NextResponse.json({ error: 'تاریخ جدید نامعتبر است' }, { status: 400 })
        const iso = isoDate(nd)
        const holiday = await db.holiday.findUnique({ where: { date: iso } })
        if (holiday)
          return NextResponse.json(
            { error: 'تاریخ سررسید تعطیل است — due date is a holiday', date: holiday.date, title: holiday.title },
            { status: 400 }
          )
        data = { dueDate: nd }
        auditAction = 'CHEQUE_RESCHEDULE'
        detail = `تغییر سررسید از ${isoDate(cheque.dueDate)} به ${iso}`
        break
      }
      case 'write': {
        data = { status: 'WRITTEN', writtenAt: now }
        auditAction = 'CHEQUE_WRITE'
        detail = `چک مبلغ ${cheque.amount.toLocaleString('fa-IR')} صادر (نوشته) شد`
        break
      }
      case 'sign': {
        data = { status: 'SIGNED', signedAt: now }
        auditAction = 'CHEQUE_SIGN'
        detail = `چک مبلغ ${cheque.amount.toLocaleString('fa-IR')} امضا شد`
        notify = { roles: ['GENERAL_MANAGER'], title: 'چک آماده تحویل', body: `چک ${cheque.purpose} به مبلغ ${cheque.amount.toLocaleString('fa-IR')} امضا شد و آماده تحویل است`, type: 'INFO' }
        break
      }
      case 'give': {
        data = {
          status: 'GIVEN',
          givenAt: now,
          recipientName: b?.recipientName ? String(b.recipientName) : cheque.recipientName,
          recipientPhone: b?.recipientPhone ? String(b.recipientPhone) : cheque.recipientPhone,
        }
        auditAction = 'CHEQUE_GIVE'
        detail = `چک مبلغ ${cheque.amount.toLocaleString('fa-IR')} تحویل${data.recipientName ? ` به ${String(data.recipientName)}` : ''} داده شد`
        notify = { roles: ['GENERAL_MANAGER'], title: 'چک تحویل داده شد', body: String(detail), type: 'INFO' }
        break
      }
      case 'collect': {
        data = { status: 'COLLECTED', collectedAt: now }
        auditAction = 'CHEQUE_COLLECT'
        detail = `چک مبلغ ${cheque.amount.toLocaleString('fa-IR')} وصول شد`
        notify = { roles: ['GENERAL_MANAGER'], title: 'چک وصول شد', body: String(detail), type: 'SUCCESS' }
        break
      }
      case 'reject': {
        const reason = b?.reason ? String(b.reason) : ''
        data = { status: 'REJECTED', decidedById: userId, decidedAt: now }
        auditAction = 'CHEQUE_REJECT'
        detail = `رد چک مبلغ ${cheque.amount.toLocaleString('fa-IR')}${reason ? ` — دلیل: ${reason}` : ''}`
        notify = { roles: ['GENERAL_MANAGER'], title: 'چک رد شد', body: reason || `چک ${cheque.purpose} رد شد`, type: 'ERROR' }
        break
      }
      case 'bounce': {
        data = { status: 'BOUNCED' }
        auditAction = 'CHEQUE_BOUNCE'
        detail = `برگشت چک مبلغ ${cheque.amount.toLocaleString('fa-IR')} — سررسید ${isoDate(cheque.dueDate)}`
        notify = {
          roles: ['GENERAL_MANAGER', 'OWNER'],
          title: 'چک برگشت خورد',
          body: String(detail),
          type: 'ERROR',
        }
        break
      }
      case 'update': {
        data = {
          ...(b?.note !== undefined ? { note: b.note ? String(b.note) : null } : {}),
          ...(b?.recipientName !== undefined ? { recipientName: b.recipientName ? String(b.recipientName) : null } : {}),
          ...(b?.recipientPhone !== undefined ? { recipientPhone: b.recipientPhone ? String(b.recipientPhone) : null } : {}),
        }
        auditAction = 'CHEQUE_UPDATE'
        detail = 'ویرایش اطلاعات چک'
        break
      }
      default:
        return NextResponse.json({ error: 'اکشن نامعتبر است' }, { status: 400 })
    }

    const updated = await db.cheque.update({ where: { id }, data, include: chequeInclude })
    if (notify) await notifyRoles(notify.roles, notify.title, notify.body, notify.type ?? 'INFO', userId)
    await audit(userId, auditAction, 'Cheque', id, detail)
    return NextResponse.json({ cheque: updated })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}
