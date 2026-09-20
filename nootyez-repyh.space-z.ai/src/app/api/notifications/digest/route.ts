import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { todayISO, isoToJalali, toFaDigits, fmtMoney, fmtJalali, JALALI_MONTHS_EN } from '@/lib/jalali'

export const dynamic = 'force-dynamic'

/**
 * POST /api/notifications/digest  { userId }
 *
 * Daily notification digest — per-role summary, generated lazily via the
 * "on-first-load-of-day" trigger (BadgesPoller fires this once per day per user
 * after the first successful badges fetch). Idempotent per Jalali day:
 * if the user already has a DIGEST notification created today (server-local
 * calendar day), returns { created:false, reason:'already' } without duplicating.
 *
 * Digest audiences:
 *  - management (OWNER, GENERAL_MANAGER, OPERATION_MANAGER, IT_ADMIN, PRODUCT_MANAGER) → full briefing
 *  - ACCOUNTANT → finance-focused briefing
 *  - everyone else → personal briefing
 *
 * Never 500s for data issues: every digest section is individually guarded and
 * simply omitted on query failure. 400 only for missing/invalid userId.
 */

const MANAGEMENT_ROLES = ['OWNER', 'GENERAL_MANAGER', 'OPERATION_MANAGER', 'IT_ADMIN', 'PRODUCT_MANAGER']
const ACTIVE_ORDER_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'RECEIVED', 'CONFIRMED']
const LIVE_CHEQUE_STATUSES = ['WRITTEN', 'SIGNED', 'GIVEN']

/** run a query, fall back silently on any failure — a digest section must never break the digest */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch {
    return fallback
  }
}

function rolesOf(user: { roles: string }): string[] {
  return user.roles.split(',').map((r) => r.trim()).filter(Boolean)
}

export async function POST(request: Request) {
  // ---- validate input (the only 400 path) ----
  let userId: number
  try {
    const b = await request.json()
    userId = Number(b?.userId)
  } catch {
    return NextResponse.json({ error: 'بدنه درخواست نامعتبر است | Invalid body' }, { status: 400 })
  }
  if (!Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json({ error: 'پارامتر userId الزامی است | userId is required' }, { status: 400 })
  }

  try {
    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user || !user.active) {
      return NextResponse.json({ error: 'کاربر یافت نشد یا غیرفعال است | User not found or inactive' }, { status: 400 })
    }

    // ---- server-local day boundaries (same convention as /api/dashboard) ----
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const in7Days = new Date(todayStart.getTime() + 7 * 24 * 3600 * 1000)
    const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000)

    // ---- idempotency: one DIGEST per user per (server-local) day ----
    const existing = await db.notification.findFirst({
      where: { userId, type: 'DIGEST', createdAt: { gte: todayStart } },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json({ created: false, reason: 'already' })
    }

    // ---- today's Jalali date, e.g. «۱۹ Shahrivar ۱۴۰۵» ----
    let faDate = ''
    try {
      const j = isoToJalali(todayISO())
      faDate = `${toFaDigits(j.jd)} ${JALALI_MONTHS_EN[j.jm - 1] ?? ''} ${toFaDigits(j.jy)}`.trim()
    } catch {
      faDate = toFaDigits(todayISO())
    }

    const roles = rolesOf(user)
    const isManagement = roles.some((r) => MANAGEMENT_ROLES.includes(r))
    const isAccountant = roles.includes('ACCOUNTANT')
    const kind: 'management' | 'accountant' | 'personal' = isManagement ? 'management' : isAccountant ? 'accountant' : 'personal'

    // ---- shared section queries (all guarded) ----
    const unreadMessages = await safe(
      () =>
        db.message.count({
          where: {
            readAt: null,
            senderId: { not: userId },
            conversation: { is: { OR: [{ userAId: userId }, { userBId: userId }] } },
          },
        }),
      0
    )
    const openTasks = await safe(
      () => db.task.count({ where: { assignedToId: userId, status: { in: ['OPEN', 'IN_PROGRESS', 'PAUSED'] } } }),
      0
    )

    let title = ''
    const lines: string[] = []

    if (kind === 'management') {
      title = `📰 Briefing ${faDate}`
      // today's deliveries (orders expected to arrive today, still active — matches the dashboard stat)
      const deliveriesToday = await safe(
        () =>
          db.order.count({
            where: { receivingDate: { gte: todayStart, lt: tomorrowStart }, status: { in: ACTIVE_ORDER_STATUSES } },
          }),
        0
      )
      // cheques due within 7 days (written/signed/given — live cheques)
      const chequesDue = await safe(
        () =>
          db.cheque.aggregate({
            where: { status: { in: LIVE_CHEQUE_STATUSES }, dueDate: { gte: todayStart, lte: in7Days } },
            _count: true,
            _sum: { amount: true },
          }),
        { _count: 0, _sum: { amount: null } }
      )
      const ordersAwaiting = await safe(() => db.order.count({ where: { status: 'SUBMITTED' } }), 0)
      const lowStock = await safe(
        // stock <= minStock needs a per-row compare → load minimal columns like /api/dashboard
        () => db.product.findMany({ select: { stock: true, minStock: true, mergedInto: true } }),
        [] as Array<{ stock: number; minStock: number; mergedInto: number | null }>
      )
      const lowStockCount = lowStock.filter((p) => !p.mergedInto && p.stock <= p.minStock).length

      lines.push(`• تحویل‌های امروز: ${toFaDigits(deliveriesToday)} مورد`)
      lines.push(
        chequesDue._count > 0
          ? `• چک‌های سررسید تا ۷ روز آینده: ${toFaDigits(chequesDue._count)} فقره — جمع ${toFaDigits(fmtMoney(chequesDue._sum.amount ?? 0))}`
          : `• چک‌های سررسید تا ۷ روز آینده: ${toFaDigits(0)} فقره`
      )
      lines.push(`• سفارش‌های در انتظار تایید: ${toFaDigits(ordersAwaiting)} مورد`)
      lines.push(`• تسک‌های باز شما: ${toFaDigits(openTasks)} مورد`)
      lines.push(`• کالاهای با کمبود موجودی: ${toFaDigits(lowStockCount)} قلم`)
      lines.push(`• پیام‌های خوانده‌نشده: ${toFaDigits(unreadMessages)} مورد`)
    } else if (kind === 'accountant') {
      title = `📰 Accounting Briefing ${faDate}`
      const chequesPending = await safe(() => db.cheque.count({ where: { status: 'PENDING_APPROVAL' } }), 0)
      const chequesDue = await safe(
        () =>
          db.cheque.aggregate({
            where: { status: { in: LIVE_CHEQUE_STATUSES }, dueDate: { gte: todayStart, lte: in7Days } },
            _count: true,
            _sum: { amount: true },
          }),
        { _count: 0, _sum: { amount: null } }
      )
      const salesToday = await safe(
        () =>
          db.sale.aggregate({
            where: { createdAt: { gte: todayStart, lt: tomorrowStart } },
            _count: true,
            _sum: { total: true },
          }),
        { _count: 0, _sum: { total: null } }
      )
      const pipelineOrders = await safe(() => db.order.count({ where: { status: { in: ['DRAFT', 'SUBMITTED'] } } }), 0)

      lines.push(`• چک‌های در انتظار تایید: ${toFaDigits(chequesPending)} فقره`)
      lines.push(
        chequesDue._count > 0
          ? `• چک‌های سررسید تا ۷ روز آینده: ${toFaDigits(chequesDue._count)} فقره — جمع ${toFaDigits(fmtMoney(chequesDue._sum.amount ?? 0))}`
          : `• چک‌های سررسید تا ۷ روز آینده: ${toFaDigits(0)} فقره`
      )
      lines.push(`• فروش امروز: ${toFaDigits(salesToday._count)} فاکتور — جمع ${toFaDigits(fmtMoney(salesToday._sum.total ?? 0))}`)
      lines.push(`• سفارش‌های جدید در جریان: ${toFaDigits(pipelineOrders)} مورد`)
      lines.push(`• پیام‌های خوانده‌نشده: ${toFaDigits(unreadMessages)} مورد`)
    } else {
      title = `📰 My Day ${faDate}`
      const nearestDue = await safe(
        () =>
          db.task.findFirst({
            where: { assignedToId: userId, status: { in: ['OPEN', 'IN_PROGRESS', 'PAUSED'] }, dueDate: { not: null } },
            orderBy: { dueDate: 'asc' },
            select: { dueDate: true },
          }),
        null as null | { dueDate: Date }
      )
      const pointsWeek = await safe(
        () => db.pointsLog.aggregate({ where: { userId, createdAt: { gte: weekAgo } }, _sum: { points: true } }),
        { _sum: { points: null } }
      )
      // note: the Order/Delivery model has no per-user assignment field → «today's deliveries assigned to me» omitted

      lines.push(`• تسک‌های باز شما: ${toFaDigits(openTasks)} مورد`)
      if (nearestDue?.dueDate) {
        lines.push(`• نزدیک‌ترین سررسید تسک: ${fmtJalali(nearestDue.dueDate)}`)
      }
      lines.push(`• پیام‌های خوانده‌نشده: ${toFaDigits(unreadMessages)} مورد`)
      lines.push(`• امتیازهای ۷ روز اخیر: ${toFaDigits(`+${pointsWeek._sum.points ?? 0}`)} امتیاز`)
    }

    lines.push('— هایپر زیتون 🫒 روزی پربار آرزوستیم')

    const body = lines.join('\n')

    const created = await db.notification.create({
      data: { userId, title, body, type: 'DIGEST' },
    })

    await db.auditLog.create({
      data: {
        userId,
        userName: user.name,
        action: 'DIGEST_GENERATE',
        entity: 'Notification',
        entityId: created.id,
        detail: `دایجست روزانه (${kind}) — ${title} | Daily digest generated on first load of day`,
      },
    })

    return NextResponse.json({ created: true, notification: created })
  } catch {
    // digest is best-effort — never blow up the client
    return NextResponse.json({ created: false, reason: 'error' })
  }
}
