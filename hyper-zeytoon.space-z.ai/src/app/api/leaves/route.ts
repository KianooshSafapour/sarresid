import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity, safeParse } from '@/lib/api-helpers'
import { daysBetween, formatJalaliShort, isFriday, jalaliToIso, jMonthLength, toJalaliParts, todayIso } from '@/lib/jalali'
import { emitNotif } from '@/lib/notif-engine'
import { hasCap } from '@/lib/rbac'

const LEAVE_TYPES = ['HOURLY', 'DAILY', 'SICK', 'UNPAID']
const TYPE_FA: Record<string, string> = { HOURLY: 'ساعتی', DAILY: 'روزانه', SICK: 'استعلاجی', UNPAID: 'بدون حقوق' }
const MANAGER_ROLES = ['OM', 'GM', 'OWNER', 'ADMIN']
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
const POLICY_KEY = 'leave.policy'

export type LeavePolicy = {
  maxPerDayWithoutReplacement: number
  hardCapPerDay: number
  requireReplacementNote: boolean
  minPresentPerShift: number
  blockFridays: boolean
  blockHolidays: boolean
}

export const DEFAULT_LEAVE_POLICY: LeavePolicy = {
  maxPerDayWithoutReplacement: 2,
  hardCapPerDay: 4,
  requireReplacementNote: true,
  minPresentPerShift: 5,
  blockFridays: false,
  blockHolidays: true,
}

const clampInt = (v: unknown, min: number, max: number, dflt: number) => {
  const n = Math.round(Number(v))
  return isFinite(n) ? Math.max(min, Math.min(max, n)) : dflt
}

/** سیاست مرخصی — در نخستین خواندن، پیش‌فرض‌ها seed می‌شود */
async function getLeavePolicy(): Promise<LeavePolicy> {
  const row = await db.setting.findUnique({ where: { key: POLICY_KEY } })
  if (!row) {
    try {
      await db.setting.upsert({ where: { key: POLICY_KEY }, update: {}, create: { key: POLICY_KEY, value: JSON.stringify(DEFAULT_LEAVE_POLICY) } })
    } catch { /* concurrent seed — ignore */ }
    return { ...DEFAULT_LEAVE_POLICY }
  }
  const p = safeParse<Partial<LeavePolicy>>(row.value, {})
  return {
    maxPerDayWithoutReplacement: clampInt(p.maxPerDayWithoutReplacement, 0, 50, DEFAULT_LEAVE_POLICY.maxPerDayWithoutReplacement),
    hardCapPerDay: clampInt(p.hardCapPerDay, 1, 50, DEFAULT_LEAVE_POLICY.hardCapPerDay),
    requireReplacementNote: p.requireReplacementNote !== false,
    minPresentPerShift: clampInt(p.minPresentPerShift, 1, 100, DEFAULT_LEAVE_POLICY.minPresentPerShift),
    blockFridays: p.blockFridays === true,
    blockHolidays: p.blockHolidays !== false,
  }
}

/** بیشترین تعداد مرخصی تأییدشدهٔ هم‌زمان (به‌ازای هر روز از بازه) + نام‌ها */
async function overlapStats(fromDate: string, toDate: string, excludeUserId: string) {
  const approved = await db.leaveRequest.findMany({
    where: { status: 'APPROVED', userId: { not: excludeUserId }, fromDate: { lte: toDate }, toDate: { gte: fromDate } },
    select: { userId: true, userName: true, fromDate: true, toDate: true },
  })
  let maxOverlap = 0
  let names: string[] = []
  let iso = fromDate
  let guard = 0
  while (iso <= toDate && guard < 200) {
    const hits = approved.filter((a) => a.fromDate <= iso && a.toDate >= iso)
    if (hits.length > maxOverlap) {
      maxOverlap = hits.length
      names = hits.map((h) => h.userName)
    } else if (hits.length === maxOverlap) {
      names = Array.from(new Set([...names, ...hits.map((h) => h.userName)]))
    }
    iso = new Date(new Date(iso + 'T12:00:00').getTime() + 86400000).toISOString().slice(0, 10)
    guard++
  }
  return { maxOverlap, names: Array.from(new Set(names)) }
}

/** اولین روز مسدودشدهٔ بازه بر اساس blockFridays/blockHolidays */
async function firstBlockedDay(fromDate: string, toDate: string, policy: LeavePolicy): Promise<{ iso: string; label: string } | null> {
  let iso = fromDate
  let guard = 0
  while (iso <= toDate && guard < 200) {
    if (policy.blockFridays && isFriday(iso)) return { iso, label: 'جمعه' }
    if (policy.blockHolidays) {
      const hol = await db.holiday.findUnique({ where: { date: iso } })
      if (hol && hol.kind !== 'OCCASION') return { iso, label: hol.title }
    }
    iso = new Date(new Date(iso + 'T12:00:00').getTime() + 86400000).toISOString().slice(0, 10)
    guard++
  }
  return null
}

/** GET /api/leaves — همهٔ داده‌های مرخصی برای ویو: درخواست‌های من، تخته تیم، صف تأیید، کاربران، آمار */
export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)

  const { searchParams } = new URL(req.url)
  const withCapacity = searchParams.get('capacity') === '1'

  const today = todayIso()
  const [mine, all, pending, users] = await Promise.all([
    db.leaveRequest.findMany({ where: { userId: me.id }, orderBy: { createdAt: 'desc' } }),
    db.leaveRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
    db.leaveRequest.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' } }), // نوبت ثبت: اولین ثبت، اولویت (FCFS)
    db.user.findMany({ select: { id: true, name: true, role: true, color: true, active: true }, orderBy: { name: 'asc' } }),
  ])

  // سیاست مرخصی + ظرفیت روزانه (برای نوار مدیر و چیپ ظرفیت تقویم تیم)
  const policy = await getLeavePolicy()
  let capacity: Record<string, { out: number; remaining: number; present: number; presentOk: boolean }> = {}
  if (withCapacity) {
    const activeCount = users.filter((u) => u.active).length
    const approved = all.filter((l) => l.status === 'APPROVED')
    const start = new Date(new Date(today + 'T12:00:00').getTime() - 10 * 86400000).toISOString().slice(0, 10)
    const end = new Date(new Date(today + 'T12:00:00').getTime() + 100 * 86400000).toISOString().slice(0, 10)
    for (let t = new Date(start + 'T12:00:00').getTime(); t <= new Date(end + 'T12:00:00').getTime(); t += 86400000) {
      const iso = new Date(t).toISOString().slice(0, 10)
      const out = approved.filter((l) => l.fromDate <= iso && l.toDate >= iso).length
      capacity[iso] = {
        out,
        remaining: Math.max(0, policy.maxPerDayWithoutReplacement - out),
        present: Math.max(0, activeCount - out),
        presentOk: activeCount - out >= policy.minPresentPerShift,
      }
    }
  }

  // آمار سال جلالی جاری
  const { jy } = toJalaliParts(today)
  const yearStart = jalaliToIso(jy, 1, 1)
  const yearEnd = jalaliToIso(jy, 12, jMonthLength(jy, 12))
  const myApprovedDays = mine
    .filter((l) => l.status === 'APPROVED' && l.fromDate >= yearStart && l.fromDate <= yearEnd)
    .reduce((s, l) => s + (l.days || 0), 0)

  const teamOutToday = all
    .filter((l) => l.status === 'APPROVED' && l.fromDate <= today && today <= l.toDate)
    .map((l) => ({ userName: l.userName, type: l.type, toDate: l.toDate }))

  return json({
    mine,
    all,
    pending,
    users,
    policy,
    capacity,
    stats: {
      myApprovedDays: Math.round(myApprovedDays * 10) / 10,
      myPending: mine.filter((l) => l.status === 'PENDING').length,
      pendingCount: pending.length,
      teamOutToday,
    },
  })
}

/** POST /api/leaves — ثبت درخواست مرخصی (همیشه PENDING؛ هشدار هم‌پوشانی بدون مسدودسازی) */
export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = await req.json().catch(() => ({}))

  const type = LEAVE_TYPES.includes(body.type) ? body.type : 'DAILY'
  const fromDate = String(body.fromDate || '').slice(0, 10)
  let toDate = String(body.toDate || '').slice(0, 10)
  const fromHour = String(body.fromHour || '').slice(0, 5)
  const toHour = String(body.toHour || '').slice(0, 5)
  const reason = String(body.reason || '').slice(0, 300)

  if (!ISO_RE.test(fromDate) || !ISO_RE.test(toDate)) return fail('تاریخ شروع و پایان الزامی و معتبر است')
  if (fromDate > toDate) return fail('تاریخ شروع نمی‌تواند بعد از تاریخ پایان باشد')

  const today = todayIso()
  if (daysBetween(fromDate, today) < -1) return fail('تاریخ شروع نمی‌تواند بیش از یک روز در گذشته باشد')

  let days: number
  if (type === 'HOURLY') {
    // مرخصی ساعتی فقط در یک روز، با بازهٔ ساعت معتبر
    if (!/^\d{2}:\d{2}$/.test(fromHour)) return fail('ساعت شروع الزامی است')
    if (!/^\d{2}:\d{2}$/.test(toHour)) return fail('ساعت پایان الزامی است')
    if (fromHour >= toHour) return fail('ساعت شروع باید قبل از ساعت پایان باشد')
    toDate = fromDate
    days = 0.5
  } else {
    days = daysBetween(toDate, fromDate) + 1
  }

  // هم‌پوشانی با مرخصی‌های «تأییدشدهٔ» همکاران دیگر — هشدار، نه مسدودسازی (اولویت با ثبتِ قبلی)
  const overlapping = await db.leaveRequest.findMany({
    where: { status: 'APPROVED', userId: { not: me.id }, fromDate: { lte: toDate }, toDate: { gte: fromDate } },
    select: { userName: true, fromDate: true, toDate: true },
  })
  const names = [...new Set(overlapping.map((o) => o.userName))]
  const conflict = names.length
    ? `توجه: در این روزها همکاران دیگری مرخصی تأییدشده دارند: ${names.join('، ')} — تصمیم نهایی با تأییدکننده است`
    : null

  const leave = await db.leaveRequest.create({
    data: {
      userId: me.id,
      userName: me.name,
      type,
      fromDate,
      toDate,
      fromHour: type === 'HOURLY' ? fromHour : '',
      toHour: type === 'HOURLY' ? toHour : '',
      days,
      reason,
      status: 'PENDING',
    },
  })

  await logActivity(
    me,
    'ثبت درخواست مرخصی',
    'leave',
    leave.id,
    `${TYPE_FA[type]} • ${fromDate}${toDate !== fromDate ? ` تا ${toDate}` : ''}${type === 'HOURLY' ? ` (${fromHour} تا ${toHour})` : ''} • ${days} روز`
  )

  // موتور قواعد اعلان — مقصدها از قاعدهٔ leave.requested (پیش‌فرض: مدیر کل)
  await emitNotif({
    event: 'leave.requested',
    title: 'درخواست مرخصی جدید',
    detail: `${me.name} برای ${formatJalaliShort(fromDate)} تا ${formatJalaliShort(toDate)} (${TYPE_FA[type]})`,
    go: '#/leaves',
    icon: '📅',
    fieldRefs: { submitter: [me.id] },
    dedupeId: leave.id,
    payload: { leaveId: leave.id },
  })

  return json({ leave, conflict, othersApprovedSameDays: overlapping }, 201)
}

/** PUT /api/leaves — تأیید/رد درخواست (مدیران) یا ذخیرهٔ سیاست مرخصی (action: 'policy') */
export async function PUT(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = await req.json().catch(() => ({}))
  const { id, action } = body

  // ── ذخیرهٔ سیاست روزهای مرخصی (Admin → تنظیمات) ──
  if (action === 'policy') {
    const isExec = ['OWNER', 'GM', 'OM', 'ADMIN'].includes(me.role)
    if (!isExec && !(await hasCap(me, 'settings.manage')))
      return fail('تنظیم سیاست مرخصی نیازمند دسترسی «مدیریت تنظیمات» است', 403)
    const next: LeavePolicy = {
      maxPerDayWithoutReplacement: clampInt(body.maxPerDayWithoutReplacement, 0, 50, DEFAULT_LEAVE_POLICY.maxPerDayWithoutReplacement),
      hardCapPerDay: clampInt(body.hardCapPerDay, 1, 50, DEFAULT_LEAVE_POLICY.hardCapPerDay),
      requireReplacementNote: body.requireReplacementNote !== false,
      minPresentPerShift: clampInt(body.minPresentPerShift, 1, 100, DEFAULT_LEAVE_POLICY.minPresentPerShift),
      blockFridays: body.blockFridays === true,
      blockHolidays: body.blockHolidays !== false,
    }
    await db.setting.upsert({ where: { key: POLICY_KEY }, update: { value: JSON.stringify(next) }, create: { key: POLICY_KEY, value: JSON.stringify(next) } })
    await logActivity(me, 'ویرایش سیاست مرخصی', 'leave', POLICY_KEY, JSON.stringify(next).slice(0, 200))
    await emitNotif({
      event: 'leave.policy.changed',
      title: 'سیاست مرخصی به‌روزرسانی شد',
      detail: `سقف بدون جایگزین: ${next.maxPerDayWithoutReplacement} نفر • سقف روزانه: ${next.hardCapPerDay} نفر • حداقل حاضرین شیفت: ${next.minPresentPerShift} — توسط ${me.name}`,
      go: '#/leaves',
      icon: '🛡️',
      severity: 'important',
      actor: { id: me.id, name: me.name },
    })
    return json({ ok: true, policy: next })
  }

  if (!id || !['approve', 'reject'].includes(action)) return fail('پارامتر نامعتبر است')
  const canDecide = MANAGER_ROLES.includes(me.role) || (await hasCap(me, 'leaves.approve'))
  if (!canDecide) return fail('فقط مدیران عملیات یا دارندگان مجوز تأیید مرخصی می‌توانند تصمیم بگیرند', 403)

  const leave = await db.leaveRequest.findUnique({ where: { id } })
  if (!leave) return fail('درخواست یافت نشد', 404)
  if (leave.status !== 'PENDING') return fail('این درخواست قبلاً بررسی شده است')

  const status = action === 'approve' ? 'APPROVED' : 'REJECTED'
  let responseNote = String(body.responseNote || '').slice(0, 300)

  // ── سیاست سقف روز مرخصی — فقط پیش از تأیید ──
  if (action === 'approve') {
    const policy = await getLeavePolicy()
    const isExec = ['OWNER', 'GM', 'OM', 'ADMIN'].includes(me.role)
    const overrideNote = String(body.overrideNote || '').trim()
    const replacementNote = String(body.replacementNote || '').trim()

    // ۱) جمعه / تعطیل رسمی — استثنا فقط با مدیر ارشد + یادداشت
    if (policy.blockFridays || policy.blockHolidays) {
      const blocked = await firstBlockedDay(leave.fromDate, leave.toDate, policy)
      if (blocked && !(isExec && overrideNote))
        return fail(`مرخصی روی ${blocked.label} (${formatJalaliShort(blocked.iso)}) مجاز نیست${isExec ? ' — برای استثنا، یادداشت استثنا را بنویسید' : ' — با مدیر ارشد هماهنگ کنید'}`)
    }

    // ۲) سقف هم‌پوشانی روزانه (استثنا: مدیر ارشد + یادداشت استثنا)
    const overriding = isExec && overrideNote.length > 0
    const { maxOverlap } = await overlapStats(leave.fromDate, leave.toDate, leave.userId)
    if (maxOverlap >= policy.hardCapPerDay && !overriding)
      return fail('سقف روزانه مرخصی پر است — امکان تأیید نیست')
    const needsReplacement =
      !overriding && (policy.requireReplacementNote ? maxOverlap > 0 : maxOverlap >= policy.maxPerDayWithoutReplacement)
    if (needsReplacement && replacementNote.length < 2)
      return fail(`سقف مرخصی بدون جایگزین پر شده (${maxOverlap} نفر) — نام جایگزین را ثبت کنید`)

    if (replacementNote) responseNote = `جایگزین: ${replacementNote}${responseNote ? ` — ${responseNote}` : ''}`
    if (isExec && overrideNote) {
      // یادداشت استثنای مدیر ارشد در پاسخ ثبت می‌شود
      responseNote = `${responseNote ? responseNote + ' — ' : ''}استثنای مدیریت: ${overrideNote.slice(0, 150)}`
    }
  }

  const updated = await db.leaveRequest.update({
    where: { id },
    data: {
      status,
      approverId: me.id,
      approverName: me.name,
      responseNote,
    },
  })

  await logActivity(
    me,
    action === 'approve' ? 'تأیید مرخصی' : 'رد مرخصی',
    'leave',
    id,
    `${leave.userName} • ${TYPE_FA[leave.type] || leave.type} • ${leave.fromDate}${leave.toDate !== leave.fromDate ? ` تا ${leave.toDate}` : ''}`
  )

  // نتیجه به خودِ درخواست‌دهنده اعلام می‌شود (fieldRef: submitter از قاعدهٔ leave.decided)
  await emitNotif({
    event: 'leave.decided',
    title: action === 'approve' ? `درخواست مرخصی شما تأیید شد ✅` : `درخواست مرخصی شما رد شد`,
    detail: `${leave.userName} • ${TYPE_FA[leave.type] || leave.type} • ${formatJalaliShort(leave.fromDate)} تا ${formatJalaliShort(leave.toDate)}${body.responseNote ? ` — یادداشت: ${String(body.responseNote).slice(0, 80)}` : ''}`,
    go: '#/leaves',
    icon: action === 'approve' ? '✅' : '🚫',
    severity: 'important',
    actor: { id: me.id, name: me.name },
    fieldRefs: { submitter: [leave.userId] },
    dedupeId: leave.id,
    payload: { leaveId: leave.id, decision: status },
  })

  return json({ leave: updated })
}

/** DELETE /api/leaves?id= — حذف درخواست در انتظارِ خودِ کاربر، یا هر درخواستی توسط مدیران */
export async function DELETE(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return fail('شناسه درخواست الزامی است')

  const leave = await db.leaveRequest.findUnique({ where: { id } })
  if (!leave) return fail('درخواست یافت نشد', 404)

  const isManager = MANAGER_ROLES.includes(me.role)
  const ownPending = leave.userId === me.id && leave.status === 'PENDING'
  if (!isManager && !ownPending) return fail('فقط درخواست‌های در انتظار تأییدِ خودتان قابل حذف است', 403)

  await db.leaveRequest.delete({ where: { id } })
  await logActivity(me, 'حذف درخواست مرخصی', 'leave', id, `${leave.userName} • ${leave.fromDate} تا ${leave.toDate}`)

  return json({ ok: true })
}
