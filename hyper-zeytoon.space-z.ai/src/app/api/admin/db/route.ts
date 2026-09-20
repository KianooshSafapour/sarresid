import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'
import { canViewApi, guardCap } from '@/lib/rbac'
import { emitNotif } from '@/lib/notif-engine'
import fs from 'fs'
import path from 'path'

/* ═══════════════════════════════════════════════════════════════════════════
 * /api/admin/db — مدیریت داده‌ها: وضعیت، بازنشانی دادهٔ نمایشی، پاک‌سازی، حالت داده
 * گاردها: GET → canViewApi(me,'data') | POST → cap «db.reset» (نقش‌های اجرایی همیشه دارند)
 * ═══════════════════════════════════════════════════════════════════════════ */

/** ارقام فارسی برای پیام‌ها و لاگ‌ها */
const fa = (n: number | string): string => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])

/** عبارت تأیید تایپی برای هر پاک‌سازی — باید دقیقاً مطابق پیام سمت کلاینت باشد */
const PURGE_CONFIRMS: Record<string, string> = {
  'purge-products': 'حذف محصولات',
  'purge-providers': 'حذف تأمین‌کنندگان',
  'purge-customers': 'حذف مشتریان',
}

async function getSetting(key: string, dflt = ''): Promise<string> {
  try {
    const row = await db.setting.findUnique({ where: { key } })
    return row?.value ?? dflt
  } catch {
    return dflt
  }
}

async function setSetting(key: string, value: string): Promise<void> {
  await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
}

/* ───────────────────────────── GET — وضعیت داده‌ها ───────────────────────────── */

export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  if (!(await canViewApi(me, 'data'))) return fail('دسترسی محدود — فقط مالک، مدیران و IT', 403)

  const [
    products, providers, customers, orders, orderItems, cheques, payments,
    preorders, users, personnel, zoneCounts, tasks, messages, activities,
    archiveDocs, customerEvents, saleEngagements, holidayCount, settings,
  ] = await Promise.all([
    db.product.count(), db.provider.count(), db.customer.count(), db.order.count(),
    db.orderItem.count(), db.cheque.count(), db.payment.count(), db.preOrder.count(),
    db.user.count(), db.personnel.count(), db.zoneCount.count(), db.task.count(),
    db.message.count(), db.activityLog.count(), db.archiveDoc.count(),
    db.customerEvent.count(), db.saleEngagement.count(), db.holiday.count(),
    db.setting.findMany({ where: { key: { in: ['data_mode', 'last_reset_at', 'last_reset_by'] } } }),
  ])

  const settingMap = new Map(settings.map((s) => [s.key, s.value]))

  // حجم فایل دیتابیس روی دیسک
  let dbSizeMB = 0
  try {
    const candidates = [
      path.join(process.cwd(), 'db', 'custom.db'),
      path.join(process.cwd(), 'prisma', 'dev.db'),
      path.join(process.cwd(), 'db', 'dev.db'),
    ]
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        dbSizeMB = Math.round((fs.statSync(p).size / (1024 * 1024)) * 100) / 100
        break
      }
    }
  } catch { /* حجم در دسترس نیست — صفر می‌ماند */ }

  // چک‌لیست دادهٔ واقعی — «انجام‌شده» یعنی رکورد موجود است (راهنمای مدیر برای جایگزینی دمو با واقعی)
  const realDataChecklist = [
    { key: 'products', label: 'کالاهای واقعی فروشگاه وارد شده باشد', done: products > 0 },
    { key: 'providers', label: 'تأمین‌کنندگان واقعی ثبت شده باشد', done: providers > 0 },
    { key: 'customers', label: 'مشتریان واقعی ثبت شده باشد', done: customers > 0 },
  ]

  return json({
    counts: {
      products, providers, customers, orders, orderItems, cheques, payments,
      preorders, users, personnel, zoneCounts, tasks, messages, activities,
      archiveDocs, customerEvents, saleEngagements, holidayCount,
    },
    demoFlag: settingMap.get('data_mode') || 'demo',
    lastReset: { at: settingMap.get('last_reset_at') || '', by: settingMap.get('last_reset_by') || '' },
    dbSizeMB,
    realDataChecklist,
  })
}

/* ───────────────────────────── POST — عملیات مخرب ───────────────────────────── */

export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const guard = await guardCap(me, 'db.reset')
  if (guard) return fail(guard, 403)

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const action = String(body.action || '')

  /* ۱) بازنشانی دادهٔ نمایشی — پاک‌سازی همهٔ داده‌های عملیاتی دمو */
  if (action === 'reset-demo') {
    const deleted: Record<string, number> = {}
    try {
      // ترتیب منطقی: فرزندان قبل از والدین (بدون قید FK — ترتیب برای شفافیت گزارش است)
      const steps: { table: string; run: () => Promise<{ count: number }> }[] = [
        { table: 'orderItem', run: () => db.orderItem.deleteMany({}) },
        { table: 'order', run: () => db.order.deleteMany({}) },
        { table: 'cheque', run: () => db.cheque.deleteMany({}) },
        { table: 'payment', run: () => db.payment.deleteMany({}) },
        { table: 'preOrder', run: () => db.preOrder.deleteMany({}) },
        { table: 'customerEvent', run: () => db.customerEvent.deleteMany({}) },
        { table: 'saleEngagement', run: () => db.saleEngagement.deleteMany({}) },
        { table: 'complaint', run: () => db.complaint.deleteMany({}) },
        { table: 'extraActivity', run: () => db.extraActivity.deleteMany({}) },
        { table: 'notifOutbox', run: () => db.notifOutbox.deleteMany({}) },
        { table: 'zoneCount', run: () => db.zoneCount.deleteMany({}) },
        { table: 'laborHour', run: () => db.laborHour.deleteMany({}) },
        { table: 'leaveRequest', run: () => db.leaveRequest.deleteMany({}) },
        { table: 'urgentQuestion', run: () => db.urgentQuestion.deleteMany({}) },
        { table: 'archiveDocItem', run: () => db.archiveDocItem.deleteMany({}) },
        { table: 'archiveDoc', run: () => db.archiveDoc.deleteMany({}) },
        { table: 'archiveCustody', run: () => db.archiveCustody.deleteMany({}) },
        { table: 'docEvent', run: () => db.docEvent.deleteMany({}) },
        { table: 'activityLog', run: () => db.activityLog.deleteMany({}) },
        { table: 'award', run: () => db.award.deleteMany({}) },
      ]
      for (const s of steps) {
        const r = await s.run()
        if (r.count > 0) deleted[s.table] = r.count
      }
    } catch (e) {
      return fail('بازنشانی ناتمام ماند: ' + (e instanceof Error ? e.message : 'خطای ناشناخته'), 500)
    }

    await Promise.all([
      setSetting('data_mode', 'demo'),
      setSetting('last_reset_at', new Date().toISOString()),
      setSetting('last_reset_by', me.name),
    ])

    const detail = Object.keys(deleted).length
      ? 'حذف شد: ' + Object.entries(deleted).map(([t, n]) => `${fa(n)} ${t}`).join('، ')
      : 'دادهٔ عملیاتی برای حذف وجود نداشت'
    await logActivity(me, 'بازنشانی دادهٔ نمایشی', 'system', 'reset-demo', detail)
    await emitNotif({
      event: 'db.reset',
      title: 'داده‌های نمایشی بازنشانی شد',
      detail: `${me.name} — ${detail}`,
      go: '#/data',
      severity: 'critical',
      icon: '🗄️',
      actor: me,
    })
    return json({ ok: true, summary: { deleted } })
  }

  /* ۲) پاک‌سازی موجودیت‌های پایه — با عبارت تأیید تایپی */
  if (action in PURGE_CONFIRMS) {
    const expected = PURGE_CONFIRMS[action]
    if (String(body.confirm || '').trim() !== expected) {
      return fail(`برای اجرای این عملیات باید عبارت «${expected}» را دقیقاً تایپ کنید`, 400)
    }

    if (action === 'purge-products') {
      const linked = await db.orderItem.count()
      if (linked > 0) {
        return fail(
          `حذف محصولات ممکن نیست — ${fa(linked)} قلم سفارش به کالاها وصل است و تاریخچهٔ مالی نباید بی‌مرجع بماند. ابتدا «بازنشانی دادهٔ نمایشی» را اجرا کنید.`,
          409
        )
      }
      const n = await db.product.deleteMany({})
      await logActivity(me, 'پاک‌سازی کامل محصولات', 'product', 'purge-products', `${fa(n.count)} کالا حذف شد`)
      return json({ ok: true, summary: { deleted: { product: n.count } } })
    }

    if (action === 'purge-providers') {
      const n = await db.provider.deleteMany({})
      await logActivity(me, 'پاک‌سازی کامل تأمین‌کنندگان', 'provider', 'purge-providers', `${fa(n.count)} تأمین‌کننده حذف شد`)
      return json({ ok: true, summary: { deleted: { provider: n.count } } })
    }

    // purge-customers — رخدادهای مشتری هم به آن‌ها وصل است؛ برای جلوگیری از رکورد یتیم همزمان پاک می‌شوند
    const events = await db.customerEvent.deleteMany({})
    const n = await db.customer.deleteMany({})
    await logActivity(me, 'پاک‌سازی کامل مشتریان', 'customer', 'purge-customers', `${fa(n.count)} مشتری و ${fa(events.count)} رخداد مشتری حذف شد`)
    return json({ ok: true, summary: { deleted: { customer: n.count, customerEvent: events.count } } })
  }

  /* ۳) تغییر حالت داده — نمایشی / واقعی */
  if (action === 'set-mode') {
    const mode = String(body.mode || '')
    if (mode !== 'demo' && mode !== 'real') return fail('حالت باید «demo» یا «real» باشد')
    await setSetting('data_mode', mode)
    await logActivity(
      me, 'تغییر حالت داده', 'system', 'set-mode',
      mode === 'real' ? 'سامانه به حالت «دادهٔ واقعی» رفت' : 'سامانه به حالت «دادهٔ نمایشی» برگشت'
    )
    return json({ ok: true, mode })
  }

  /* ۴) پاک‌سازی اعلان‌های قدیمی دمو — بیشتر از ۷ روز */
  if (action === 'purge-demo-notifs') {
    const cutoff = new Date(Date.now() - 7 * 24 * 3600_000)
    const n = await db.notifOutbox.deleteMany({ where: { createdAt: { lt: cutoff } } })
    await logActivity(me, 'پاک‌سازی اعلان‌های قدیمی', 'notifOutbox', 'purge-demo-notifs', `${fa(n.count)} اعلان قدیمی‌تر از ۷ روز حذف شد`)
    return json({ ok: true, summary: { deleted: { notifOutbox: n.count } } })
  }

  return fail('عملیات ناشناخته است', 400)
}
