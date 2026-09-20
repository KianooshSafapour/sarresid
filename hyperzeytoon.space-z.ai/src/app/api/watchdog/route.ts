import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, notifyRoles, logActivity } from '@/lib/server-utils'
import { isoDay, addDays } from '@/lib/jalali'
import { maybeSendWeeklyDigest } from '@/app/api/reports/_weekly'

/**
 * Watchdog — called by the dashboard on load (poor-man's cron until Redis/BullMQ).
 * Creates deduplicated notifications for:
 *  - orders past their receiving date still in APPROVED/SENT (management follow-up)
 *  - cheques stuck in PENDING_OWNER for more than 3 days (owner reminder)
 *  - cheques due within 3 days not yet delivered
 * Also fires the WEEKLY intelligence digest at most once per week
 * (deduped via the last_weekly_digest setting).
 */
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const since = new Date(now.getTime() - 20 * 3600 * 1000) // dedup window: 20h

  let created = 0

  // 1) overdue orders
  const overdue = await db.order.findMany({
    where: { receivingDate: { lt: todayStart }, status: { in: ['APPROVED', 'SENT'] } },
    select: { code: true, providerName: true },
    take: 20,
  })
  for (const o of overdue) {
    const exists = await db.notification.count({
      where: { type: 'WARNING', title: { contains: o.code }, createdAt: { gte: since } },
    })
    if (exists === 0) {
      await notifyRoles(
        ['gm', 'pm', 'om'],
        `سفارش عقب‌افتاده: ${o.code}`,
        `${o.providerName} — موعد تحویل گذشته و دریافت نشده. پیگیری لازم است.`,
        'WARNING',
        'orders'
      )
      created++
    }
  }

  // 2) cheques awaiting signature > 3 days
  const stuckCheques = await db.cheque.findMany({
    where: { status: 'PENDING_OWNER', createdAt: { lt: addDays(now, -3) } },
    select: { number: true, amount: true },
    take: 20,
  })
  for (const c of stuckCheques) {
    const exists = await db.notification.count({
      where: { type: 'WARNING', title: { contains: c.number }, createdAt: { gte: since } },
    })
    if (exists === 0) {
      await notifyRoles(
        ['owner', 'gm'],
        `چک ${c.number} هنوز امضا نشده`,
        'بیش از ۳ روز از ثبت گذشته است. لطفاً بررسی و امضا کنید.',
        'WARNING',
        'payments'
      )
      created++
    }
  }

  // 3) cheques due within 3 days not delivered
  const dueSoon = await db.cheque.findMany({
    where: {
      status: { in: ['PENDING_OWNER', 'SIGNED'] },
      dueDate: { gte: todayStart, lte: addDays(todayStart, 3) },
    },
    select: { number: true, dueDate: true },
    take: 20,
  })
  for (const c of dueSoon) {
    const exists = await db.notification.count({
      where: { type: 'WARNING', title: { contains: c.number }, createdAt: { gte: since } },
    })
    if (exists === 0) {
      await notifyRoles(
        ['owner', 'gm'],
        `چک ${c.number} به زودی سررسید می‌شود`,
        'سررسید نزدیک است اما هنوز تحویل نشده. اقدام کنید.',
        'WARNING',
        'payments'
      )
      created++
    }
  }

  // 4) weekly intelligence digest (self-deduped — at most one per week)
  let weeklySent = false
  try {
    const weekly = await maybeSendWeeklyDigest()
    weeklySent = weekly.sent
    if (weekly.sent) {
      await logActivity(user.id, user.name, 'گزارش هفتگی خودکار ارسال شد', 'reports')
    }
  } catch {
    /* digest failure must never break the watchdog */
  }

  if (created > 0) {
    await logActivity(user.id, user.name, 'هشدار خودکار سامانه', 'Watchdog', undefined, `${created} هشدار جدید`)
  }
  return ok({ created, weeklySent, checkedAt: isoDay(now) })
}
