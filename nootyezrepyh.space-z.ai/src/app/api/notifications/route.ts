import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { toJalaali } from '@/lib/jalaali-core'
import { toFaDigits } from '@/lib/jalali'

export interface NotificationItem {
  id: string
  kind: string
  severity: 'urgent' | 'warning' | 'info'
  title: string
  body?: string
  section: string
  count?: number
}

function todayJalaliStr(): string {
  const t = new Date(Date.now() + 3.5 * 3600000)
  const { jy, jm, jd } = toJalaali(t.getFullYear(), t.getMonth() + 1, t.getDate())
  return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`
}

/** GET /api/notifications → role-aware unified alerts */
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  const roles = session.roles
  const items: NotificationItem[] = []

  // ---- order related ----
  if (canUser(roles, PERMISSIONS.MANAGE_ORDERS) || canUser(roles, PERMISSIONS.APPROVE_ORDERS)) {
    const pending = await db.order.count({ where: { status: 'PENDING_APPROVAL' } })
    if (pending > 0) {
      items.push({
        id: 'orders-pending-approval', kind: 'approval', severity: 'warning',
        title: `${pending} سفارش در انتظار تأیید شماست`,
        body: 'سفارش‌های ثبت‌شده توسط مدیر محصول منتظر تأیید شما هستند.',
        section: 'orders', count: pending,
      })
    }
    const overdue = await db.order.count({ where: { status: { in: ['APPROVED', 'EXPECTED'] }, deliveryDate: { lt: todayJalaliStr() } } })
    if (overdue > 0) {
      items.push({
        id: 'orders-overdue', kind: 'overdue', severity: 'urgent',
        title: `${overdue} سفارش از موعد تحویل گذشته`,
        body: 'بهتر است با تأمین‌کننده پیگیری کنید.',
        section: 'orders', count: overdue,
      })
    }
  }

  if (canUser(roles, PERMISSIONS.RECEIVE_DELIVERY)) {
    const expected = await db.order.count({ where: { status: { in: ['APPROVED', 'EXPECTED'] } } })
    if (expected > 0) {
      items.push({
        id: 'deliveries-expected', kind: 'delivery', severity: 'info',
        title: `${expected} سفارش در انتظار دریافت است`,
        body: 'مرسولات امروز را بررسی و ثبت کنید.',
        section: 'deliveries', count: expected,
      })
    }
  }

  if (canUser(roles, PERMISSIONS.INSPECT_DELIVERY)) {
    const received = await db.order.count({ where: { status: 'RECEIVED' } })
    if (received > 0) {
      items.push({
        id: 'deliveries-inspect', kind: 'inspect', severity: 'warning',
        title: `${received} مرسوله در انتظار کنترل انبار`,
        body: 'کنترل نهایی و ارسال به حسابداری.',
        section: 'deliveries', count: received,
      })
    }
  }

  if (canUser(roles, PERMISSIONS.ACCOUNTING)) {
    const inspected = await db.order.count({ where: { status: 'INSPECTED' } })
    const inHoloo = await db.order.count({ where: { status: 'TO_HOLOO' } })
    if (inspected > 0) {
      items.push({
        id: 'accounting-queue', kind: 'holoo', severity: 'info',
        title: `${inspected} سفارش آماده ثبت در هلو`,
        body: 'فایل اکسل را بگیرید و سفارش را وارد هلو کنید.',
        section: 'accounting', count: inspected,
      })
    }
    if (inHoloo > 0) {
      items.push({
        id: 'accounting-inholoo', kind: 'holoo-progress', severity: 'warning',
        title: `${inHoloo} سفارش در میانه ثبت هلو`,
        section: 'accounting', count: inHoloo,
      })
    }
  }

  // ---- cheques ----
  if (canUser(roles, PERMISSIONS.APPROVE_CHEQUES)) {
    const pendingOwner = await db.cheque.count({ where: { status: 'PENDING_OWNER' } })
    if (pendingOwner > 0) {
      items.push({
        id: 'cheques-pending-owner', kind: 'cheque-sign', severity: 'urgent',
        title: `${pendingOwner} چک در انتظار صدور و امضای شما`,
        body: 'لطفاً وضعیت چک‌ها را مشخص کنید.',
        section: 'cheques', count: pendingOwner,
      })
    }
  }
  if (canUser(roles, PERMISSIONS.MANAGE_CHEQUES)) {
    const uncollected = await db.cheque.count({ where: { status: { in: ['WRITTEN', 'SIGNED', 'READY'] } } })
    if (uncollected > 0) {
      items.push({
        id: 'cheques-uncollected', kind: 'cheque-followup', severity: 'warning',
        title: `${uncollected} چک صادرشده هنوز تحویل نشده`,
        body: 'پیگیری تحویل چک به نماینده لازم است.',
        section: 'cheques', count: uncollected,
      })
    }
  }

  // ---- stock ----
  if (canUser(roles, PERMISSIONS.MANAGE_PRODUCTS) || canUser(roles, PERMISSIONS.WAREHOUSE)) {
    const products = await db.product.findMany({ where: { active: true, mergedInto: null }, select: { stock: true, minStock: true } })
    const critical = products.filter((p) => p.stock <= p.minStock * 0.5).length
    if (critical > 0) {
      items.push({
        id: 'stock-critical', kind: 'stock', severity: 'urgent',
        title: `${critical} کالا در آستانه کمبود جدی`,
        body: 'زودتر سفارش دهید تا قفسه‌ها خالی نماند.',
        section: 'products', count: critical,
      })
    }
  }

  // ---- my tasks ----
  const myTasks = await db.task.findMany({
    where: {
      OR: [{ assignedTo: session.id, assigneeType: 'USER' }, { assigneeType: 'ROLE', assignedTo: { in: roles } }],
      status: { in: ['TODO', 'IN_PROGRESS'] },
    },
    select: { id: true, title: true, dueDate: true, priority: true },
  })
  if (myTasks.length > 0) {
    const today = todayJalaliStr()
    const due = myTasks.filter((t) => t.dueDate && t.dueDate < today).length
    items.push({
      id: 'tasks-mine', kind: 'task', severity: due > 0 ? 'warning' : 'info',
      title: due > 0 ? `${due} وظیفه از موعد گذشته — ${myTasks.length} وظیفه باز` : `${myTasks.length} وظیفه در انتظار شما`,
      body: myTasks[0]?.title,
      section: 'tasks', count: myTasks.length,
    })
  }

  // ---- follow-up tasks reported by staff (managers) ----
  if (canUser(roles, PERMISSIONS.MANAGE_TASKS)) {
    const blocked = await db.task.count({ where: { status: 'FOLLOW_UP' } })
    if (blocked > 0) {
      items.push({
        id: 'tasks-blocked', kind: 'task-blocked', severity: 'warning',
        title: `${blocked} وظیفه نیازمند پیگیری شماست`,
        body: 'همکاران مانعی را گزارش کرده‌اند.',
        section: 'tasks', count: blocked,
      })
    }
    const pendingIdeas = await db.idea.count({ where: { status: 'SUBMITTED' } })
    if (pendingIdeas > 0) {
      items.push({
        id: 'ideas-pending', kind: 'idea', severity: 'info',
        title: `${pendingIdeas} ایده نو در انتظار بررسی`,
        body: 'به ایده‌های تیم فرصت بدهید 🌱',
        section: 'feedback', count: pendingIdeas,
      })
    }
  }

  // ---- warehouse requests (storekeeper) ----
  if (canUser(roles, PERMISSIONS.WAREHOUSE) || canUser(roles, PERMISSIONS.INSPECT_DELIVERY)) {
    const whReq = await db.warehouseRequest.count({ where: { status: 'PENDING' } })
    if (whReq > 0) {
      items.push({
        id: 'warehouse-pending', kind: 'warehouse', severity: 'info',
        title: `${whReq} درخواست کالا از انبار`,
        body: 'چیدمان‌دارها منتظر آماده‌سازی هستند.',
        section: 'warehouse', count: whReq,
      })
    }
  }

  // ---- sale orders (cashiers) ----
  if (canUser(roles, PERMISSIONS.CASHIER)) {
    const pendingSales = await db.saleOrder.count({ where: { status: 'PENDING' } })
    if (pendingSales > 0) {
      items.push({
        id: 'sales-pending', kind: 'sale', severity: 'info',
        title: `${pendingSales} سفارش فروش پیش‌ثبت‌شده`,
        body: 'آماده تأیید و ارسال به صندوق.',
        section: 'sales', count: pendingSales,
      })
    }
  }

  // ---- customer birthdays (front-of-house + managers) ----
  if (canUser(roles, PERMISSIONS.SALES_FLOOR) || canUser(roles, PERMISSIONS.CASHIER) || canUser(roles, PERMISSIONS.MANAGE_ORDERS)) {
    const { addDaysJalali } = await import('@/lib/jalali')
    const today = todayJalaliStr()
    const customers = await db.customer.findMany({
      where: { birthday: { not: null } },
      select: { id: true, name: true, birthday: true },
    })
    const mdOf = (j: string) => j.slice(5) // "MM/DD"
    const todayMd = mdOf(today)
    const upcoming: typeof customers = []
    for (let off = 1; off <= 7; off++) {
      const md = mdOf(addDaysJalali(today, off))
      upcoming.push(...customers.filter((c) => c.birthday && mdOf(c.birthday) === md))
    }
    const birthdayToday = customers.filter((c) => c.birthday && mdOf(c.birthday) === todayMd)
    if (birthdayToday.length > 0) {
      items.push({
        id: 'birthday-today', kind: 'birthday', severity: 'urgent',
        title: `🎂 تولد ${birthdayToday.map((c) => c.name).join(' و ')} امروز است`,
        body: 'یک تبریک کوچک، مشتری را برای همیشه خوشحال می‌کند.',
        section: 'sales', count: birthdayToday.length,
      })
    }
    if (upcoming.length > 0) {
      const names = [...new Set(upcoming.map((c) => c.name))].slice(0, 3).join(' و ')
      items.push({
        id: 'birthday-upcoming', kind: 'birthday', severity: 'info',
        title: `تولد ${names} در ۷ روز آینده`,
        body: 'آماده شدن یک پیشنهاد ویژه، حس خوبی می‌سازد.',
        section: 'sales', count: upcoming.length,
      })
    }
  }

  // ---- my shift today ----
  {
    const { addDaysJalali, jalaliWeekday } = await import('@/lib/jalali')
    const today = todayJalaliStr()
    const weekStart = addDaysJalali(today, -jalaliWeekday(today))
    const day = jalaliWeekday(today) // 0=شنبه..6=جمعه
    const myShift = await db.shift.findFirst({
      where: { userId: session.id, weekStart, day },
    })
    const labels: Record<string, string> = { MORNING: 'صبح', EVENING: 'عصر', NIGHT: 'شب', OFF: 'مرخصی' }
    items.push({
      id: 'my-shift-today', kind: 'shift', severity: 'info',
      title: myShift ? `شیفت امروز شما: ${labels[myShift.type] || myShift.type}` : 'برنامه شیفت امروز شما مشخص نیست',
      body: myShift?.note || 'برنامه کامل هفته در بخش «شیفت‌های هفته».',
      section: 'shifts',
    })

    // ---- shift coverage warnings for planners (next 2 days) ----
    if (canUser(roles, PERMISSIONS.MANAGE_SHIFTS)) {
      const MIN_COVER: Record<string, number> = { MORNING: 2, EVENING: 2, NIGHT: 1 }
      const shiftLabels: Record<string, string> = { MORNING: 'صبح', EVENING: 'عصر', NIGHT: 'شب' }
      const dayNames = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه']
      const weekStarts = [weekStart, addDaysJalali(weekStart, 7)]
      const rows = await db.shift.findMany({
        where: { weekStart: { in: weekStarts }, type: { in: ['MORNING', 'EVENING', 'NIGHT'] } },
        select: { weekStart: true, day: true, type: true },
      })
      for (let offset = 1; offset <= 2; offset++) {
        const dStr = addDaysJalali(today, offset)
        const ws = weekStarts.find((w) => w === addDaysJalali(dStr, -jalaliWeekday(dStr))) || weekStart
        const dayRows = rows.filter((r) => r.weekStart === ws && r.day === jalaliWeekday(dStr))
        if (dayRows.length === 0) continue // week not planned yet — no alarm noise
        const counts: Record<string, number> = { MORNING: 0, EVENING: 0, NIGHT: 0 }
        for (const r of dayRows) counts[r.type]++
        const empty = (Object.keys(counts) as (keyof typeof counts)[]).filter((t) => counts[t] === 0)
        const short = (Object.keys(counts) as (keyof typeof counts)[]).filter((t) => counts[t] > 0 && counts[t] < MIN_COVER[t])
        const dayName = dayNames[jalaliWeekday(dStr)]
        const when = offset === 1 ? 'فردا' : `پس‌فردا (${dayName})`
        if (empty.length > 0) {
          items.push({
            id: `shift-coverage-${dStr.replace(/\//g, '-')}`, kind: 'shift-coverage', severity: 'urgent',
            title: `${when} شیفت ${empty.map((t) => shiftLabels[t]).join(' و ')} هیچ نفری ندارد`,
            body: 'لطفاً پیش از پایان امروز برنامهٔ شیفت را کامل کنید.',
            section: 'shifts',
          })
        } else if (short.length > 0) {
          items.push({
            id: `shift-coverage-${dStr.replace(/\//g, '-')}`, kind: 'shift-coverage', severity: 'warning',
            title: `${when} نصاب ناقص است — ${short.map((t) => `${shiftLabels[t]} (${toFaDigits(counts[t])} از ${toFaDigits(MIN_COVER[t])})`).join('، ')}`,
            body: 'بررسی کنید که پوشش شیفت‌ها کافی باشد.',
            section: 'shifts',
          })
        }
      }
    }
  }

  const unread = items.filter((i) => i.severity !== 'info').length
  return Response.json({ items, unread: items.length, urgent: unread })
}
