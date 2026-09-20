import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { todayJalali, parseJalali, addDaysJalali, jalaliWeekday, jalaliMonthLength } from '@/lib/jalali'

/**
 * GET /api/planner?month=1405/06
 * Month-aggregated planner feed for the dashboard month widget:
 * tasks due + cheque due dates + expected deliveries + holidays + shifts.
 * All dates are stored as Jalali strings, so month filtering is a prefix match.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()

  const { searchParams } = new URL(req.url)
  const today = todayJalali()
  const t = parseJalali(today)
  const monthParam = (searchParams.get('month') || '').trim()
  let prefix = ''
  if (/^\d{4}\/\d{2}$/.test(monthParam)) {
    prefix = monthParam + '/'
  } else if (t) {
    prefix = `${t.jy}/${String(t.jm).padStart(2, '0')}/`
  }
  if (!prefix) return Response.json({ error: 'ماه نامعتبر است' }, { status: 400 })

  const isFinance = ['OWNER', 'GENERAL_MANAGER', 'ACCOUNTANT', 'OPERATION_MANAGER'].some((r) => session.roles.includes(r))
  const canSeeOrders = canUser(session.roles, PERMISSIONS.VIEW_DASHBOARD)

  // shifts: resolve which Saturday-weeks cover this month, then fetch once.
  let shifts: { userId: string; weekStart: string; day: number; type: string }[] = []
  if (t) {
    const len = jalaliMonthLength(t.jy, t.jm)
    const weekStarts = new Set<string>()
    for (let d = 1; d <= len; d++) {
      const date = `${t.jy}/${String(t.jm).padStart(2, '0')}/${String(d).padStart(2, '0')}`
      weekStarts.add(addDaysJalali(date, -jalaliWeekday(date)))
    }
    shifts = await db.shift.findMany({
      where: { weekStart: { in: [...weekStarts] } },
      select: { userId: true, weekStart: true, day: true, type: true },
    })
  }

  const [tasks, cheques, orders, holidays] = await Promise.all([
    db.task.findMany({
      where: { dueDate: { startsWith: prefix }, status: { not: 'DONE' } },
      select: { id: true, title: true, dueDate: true, status: true, priority: true, assigneeType: true, assignedTo: true },
    }),
    isFinance
      ? db.cheque.findMany({
          where: { dueDate: { startsWith: prefix }, status: { notIn: ['DONE', 'REJECTED'] } },
          select: { id: true, amount: true, dueDate: true, status: true, payeeName: true },
        })
      : Promise.resolve([] as { id: string; amount: number; dueDate: string; status: string; payeeName: string }[]),
    canSeeOrders
      ? db.order.findMany({
          where: { deliveryDate: { startsWith: prefix }, status: { in: ['APPROVED', 'EXPECTED', 'RECEIVED', 'INSPECTED', 'TO_HOLOO'] } },
          select: { id: true, number: true, deliveryDate: true, status: true, supplier: { select: { name: true } } },
        })
      : Promise.resolve([] as { id: string; number: number; deliveryDate: string; status: string; supplier: { name: string } }[]),
    db.holiday.findMany({ where: { date: { startsWith: prefix } }, select: { date: true, title: true } }),
  ])

  // resolve assignee names for tasks (user or role)
  const users = await db.user.findMany({ select: { id: true, name: true, roles: true }, where: { active: true } })
  const nameById = new Map(users.map((u) => [u.id, u.name]))

  // map shifts to concrete Jalali dates inside the month (weekStart + day)
  const shiftDays = shifts
    .map((s) => ({ userId: s.userId, date: addDaysJalali(s.weekStart, s.day), type: s.type }))
    .filter((s) => s.date.startsWith(prefix))

  return Response.json({
    month: prefix.slice(0, 7),
    today,
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      date: task.dueDate,
      status: task.status,
      priority: task.priority,
      assignee: task.assigneeType === 'USER'
        ? (nameById.get(task.assignedTo) || '—')
        : `نقش: ${task.assignedTo}`,
      mine: task.assigneeType === 'USER' && task.assignedTo === session.id,
    })),
    cheques: cheques.map((ch) => ({
      id: ch.id, date: ch.dueDate, amount: ch.amount, status: ch.status, payeeName: ch.payeeName,
    })),
    deliveries: orders.map((o) => ({
      id: o.id, date: o.deliveryDate, number: o.number, status: o.status, supplierName: o.supplier?.name || '—',
    })),
    holidays: holidays.map((h) => ({ date: h.date, title: h.title })),
    shifts: shiftDays,
  })
}
