import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, logActivity, notifyRoles } from '@/lib/server-utils'
import { isoDay, addDays, toJalali, formatJalali, toFaDigits, JALALI_MONTHS, toGregorian, jalaliMonthLength } from '@/lib/jalali'
import { readLeavePolicy, parseISODate, DAY_MS } from '@/lib/leave'

// ============================================================
// مرخصی و غیبت — هماهنگی تیم
// طراحی «کارمند-محور»: شفافیت برنامه، رزرو منصفانه روزها، لحن رسمی و بدون هیچ برخورد تنبیهی
// ============================================================

function overlaps(aFrom: Date, aTo: Date, bFrom: Date, bTo: Date): boolean {
  return aFrom.getTime() <= bTo.getTime() && aTo.getTime() >= bFrom.getTime()
}

/** every local day (noon) from from..to inclusive */
function eachDay(from: Date, to: Date): Date[] {
  const days: Date[] = []
  const cur = new Date(from)
  let guard = 0
  while (cur.getTime() <= to.getTime() && guard < 400) {
    days.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
    guard++
  }
  return days
}

function liteUser(u?: { id: string; name: string; color: string; title: string } | null) {
  return u ? { id: u.id, name: u.name, color: u.color, title: u.title } : null
}

/** LeaveRequest مدل بدون relation است — پیوستن دستی اطلاعات کاربر */
async function withUsers<T extends { userId: string }>(rows: T[]): Promise<(T & { user: { id: string; name: string; color: string; title: string } | null })[]> {
  const ids = Array.from(new Set(rows.map((r) => r.userId)))
  if (ids.length === 0) return rows.map((r) => ({ ...r, user: null }))
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, color: true, title: true },
  })
  const map = new Map(users.map((u) => [u.id, u]))
  return rows.map((r) => ({ ...r, user: liteUser(map.get(r.userId)) }))
}

// ------------------------------------------------------------
// GET — scope=mine (own history + stats) | scope=pending (managers) | scope=team&from=&to= (calendar, everyone)
// ------------------------------------------------------------
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const url = new URL(req.url)
  const scope = url.searchParams.get('scope') || 'mine'

  if (scope === 'pending') {
    if (!user.isManager) return fail('دسترسی غیرمجاز', 403)
    const rows = await db.leaveRequest.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 200,
    })
    return ok({ leaves: await withUsers(rows) })
  }

  if (scope === 'all') {
    // تاریخچه کامل تیم — فقط مدیران
    if (!user.isManager) return fail('دسترسی غیرمجاز', 403)
    const rows = await db.leaveRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 300,
    })
    return ok({ leaves: await withUsers(rows) })
  }

  if (scope === 'team') {
    // شفافیت برنامه — تقویم تیمی برای همه همکاران قابل مشاهده است
    const fromS = url.searchParams.get('from') || isoDay(addDays(new Date(), -45))
    const toS = url.searchParams.get('to') || isoDay(addDays(new Date(), 90))
    const from = parseISODate(fromS)
    const to = parseISODate(toS)
    if (!from || !to) return fail('بازه تاریخ نامعتبر است')
    const fromBound = new Date(from.getTime() - DAY_MS) // inclusive coverage check
    const toBound = new Date(to.getTime() + DAY_MS)
    const rows = await db.leaveRequest.findMany({
      where: {
        status: { in: ['APPROVED', 'PENDING'] },
        fromDate: { lte: toBound },
        toDate: { gte: fromBound },
      },
      orderBy: { fromDate: 'asc' },
      take: 600,
    })
    return ok({ leaves: await withUsers(rows), from: fromS, to: toS })
  }

  // scope=mine — سوابق خودم + آمار شخصی و تیمی
  const leaves = await db.leaveRequest.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  const policy = await readLeavePolicy()

  // محدوده ماه جلالی جاری (نیمه‌روز محلی)
  const nowJ = toJalali(new Date())
  const jStartG = toGregorian(nowJ.jy, nowJ.jm, 1)
  const jStartNoon = new Date(jStartG.getFullYear(), jStartG.getMonth(), jStartG.getDate(), 12)
  const jEndG = toGregorian(nowJ.jy, nowJ.jm, jalaliMonthLength(nowJ.jy, nowJ.jm))
  const jEndNoon = new Date(jEndG.getFullYear(), jEndG.getMonth(), jEndG.getDate(), 12)

  // مانده مرخصی این ماه = سهمیه ماهانه − روزهای تأییدشده روزانه در ماه جاری
  let usedDays = 0
  for (const l of leaves) {
    if (l.status !== 'APPROVED' || l.kind !== 'DAILY') continue
    const f = new Date(l.fromDate)
    const t = new Date(l.toDate)
    const lo = Math.max(f.getTime(), jStartNoon.getTime())
    const hi = Math.min(t.getTime(), jEndNoon.getTime())
    if (hi >= lo) usedDays += Math.round((hi - lo) / DAY_MS) + 1
  }
  const monthlyRemaining = Math.max(0, policy.monthlyDays - usedDays)

  const pendingCount = await db.leaveRequest.count({ where: { userId: user.id, status: 'PENDING' } })

  const teamSize = await db.user.count({ where: { active: true } })
  const now = new Date()
  const todayNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
  const awayToday = await db.leaveRequest.findMany({
    where: { status: 'APPROVED', fromDate: { lte: todayNoon }, toDate: { gte: todayNoon } },
    select: { userId: true },
  })
  const awayCount = new Set(awayToday.map((a) => a.userId)).size
  const presentToday = Math.max(0, teamSize - awayCount)

  return ok({
    leaves,
    stats: { monthlyRemaining, monthlyDays: policy.monthlyDays, usedDays, pendingCount, teamSize, presentToday, awayToday: awayCount },
    policy,
    monthLabel: `${JALALI_MONTHS[nowJ.jm - 1]} ${toFaDigits(nowJ.jy)}`,
    today: isoDay(now),
  })
}

// ------------------------------------------------------------
// POST — ثبت درخواست مرخصی (روزانه / ساعتی) با کنترل ظرفیت منصفانه روزها
// ------------------------------------------------------------
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)

  const body = (await req.json().catch(() => ({}))) as {
    kind?: string
    fromISO?: string
    toISO?: string
    hours?: number
    reason?: string
  }

  const kind = body.kind === 'HOURLY' ? 'HOURLY' : 'DAILY'
  if (!body.fromISO || !body.toISO) return fail('تاریخ شروع و پایان لازم است')
  const from = parseISODate(body.fromISO)
  const to = parseISODate(body.toISO)
  if (!from || !to) return fail('تاریخ ارسالی نامعتبر است — قالب صحیح yyyy-mm-dd است')
  if (to.getTime() < from.getTime()) return fail('تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد')

  const policy = await readLeavePolicy()

  let hours: number | null = null
  if (kind === 'HOURLY') {
    hours = Number(body.hours)
    if (!hours || hours <= 0) return fail('تعداد ساعت مرخصی را مشخص کنید')
    if (hours > policy.hourlyMaxHours) {
      return fail(`مرخصی ساعتی حداکثر ${toFaDigits(policy.hourlyMaxHours)} ساعت در روز است — برای مدت بیشتر، درخواست روزانه ثبت کنید`)
    }
    if (to.getTime() !== from.getTime()) {
      return fail('مرخصی ساعتی برای یک روز ثبت می‌شود — برای چند روز، درخواست روزانه بسازید')
    }
  }

  const reason = body.reason?.trim() || null
  if (reason && reason.length > 500) return fail('توضیح حداکثر ۵۰۰ نویسه است')

  // همپوشانی با درخواست‌های فعال خود کاربر (PENDING/APPROVED)
  const ownActive = await db.leaveRequest.findMany({
    where: { userId: user.id, status: { in: ['PENDING', 'APPROVED'] } },
    select: { fromDate: true, toDate: true },
  })
  for (const o of ownActive) {
    if (overlaps(from, to, new Date(o.fromDate), new Date(o.toDate))) {
      return fail('شما یک درخواست همپوشان دارید — ابتدا درخواست قبلی را لغو کنید یا تاریخ دیگری انتخاب کنید')
    }
  }

  // ظرفیت روزانه: برای هر روزِ بازه، شمارِ مرخصی‌های تأییدشدهٔ همکاران
  const days = eachDay(from, to)
  const approved = await db.leaveRequest.findMany({
    where: { status: 'APPROVED', userId: { not: user.id } },
    select: { fromDate: true, toDate: true },
  })
  const fullDays: string[] = []
  for (const day of days) {
    const count = approved.filter((a) => {
      const af = new Date(a.fromDate)
      const at = new Date(a.toDate)
      return af.getTime() <= day.getTime() && at.getTime() >= day.getTime()
    }).length
    if (count >= policy.maxSameDay) {
      fullDays.push(formatJalali(day))
    }
  }
  if (fullDays.length > 0) {
    return fail(
      `ظرفیت مرخصی این ${fullDays.length > 1 ? 'روزها' : 'روز'} تکمیل است — روز دیگری را انتخاب کنید: ${fullDays.join('، ')}`,
      400,
    )
  }

  const created = await db.leaveRequest.create({
    data: {
      userId: user.id,
      kind,
      fromDate: from,
      toDate: to,
      hours,
      reason,
      status: 'PENDING',
    },
  })

  const kindLabel = kind === 'HOURLY' ? `${toFaDigits(hours ?? 0)} ساعت (${formatJalali(from)})` : `${formatJalali(from)} تا ${formatJalali(to)}`
  await notifyRoles(
    ['gm', 'om', 'owner'],
    'درخواست مرخصی جدید 🌿',
    `${user.name} درخواست هماهنگی مرخصی ثبت کرد: ${kindLabel}${reason ? ` — ${reason}` : ''}`,
    'INFO',
    'leaves',
    user.id,
  )
  await logActivity(user.id, user.name, 'ثبت درخواست مرخصی', 'LeaveRequest', created.id, kindLabel)

  return ok({ success: true, id: created.id, leave: created })
}
