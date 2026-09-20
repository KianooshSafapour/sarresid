import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok } from '@/lib/server-utils'
import { toJalali, isoDay, addDays, toFaDigits, JALALI_MONTHS, jalaliKey } from '@/lib/jalali'

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)

  const canCount = user.isManager || user.roleKeys.includes('inventory')

  const now = new Date()
  const todayIso = isoDay(now)
  const in7 = isoDay(addDays(now, 7))
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const [orderStatusGroups, todayOrders, overdueOrders, pendingApprovals, lowStock, pendingCheques, dueSoonCheques, tasksMine, unreadNotifs, salesLast30, teamPoints, holidayList, todayDeliveries, chequesDueToday, myTasks, myChecklists, openStockCount] = await Promise.all([
    db.order.groupBy({ by: ['status'], _count: true, _sum: { finalAmount: true } }),
    db.order.count({ where: { receivingDate: { gte: dayStart, lt: addDays(dayStart, 1) }, status: { notIn: ['CANCELLED', 'DONE'] } } }),
    db.order.findMany({
      where: { receivingDate: { lt: dayStart }, status: { in: ['APPROVED', 'SENT'] } },
      select: { code: true, providerName: true, receivingDate: true },
      take: 6,
      orderBy: { receivingDate: 'asc' },
    }),
    db.order.count({ where: { status: 'PENDING_APPROVAL' } }),
    db.product.count({ where: { stock: { lte: 6 }, status: 'ACTIVE' } }),
    db.cheque.count({ where: { status: 'PENDING_OWNER' } }),
    db.cheque.findMany({
      where: { status: { in: ['PENDING_OWNER', 'SIGNED'] }, dueDate: { gte: now } },
      orderBy: { dueDate: 'asc' },
      take: 5,
      select: { number: true, amount: true, dueDate: true, status: true, payeeName: true },
    }),
    db.task.count({ where: { assignedToId: user.id, status: { in: ['TODO', 'IN_PROGRESS', 'FOLLOW_UP'] } } }),
    db.notification.count({ where: { userId: user.id, read: false } }),
    db.productSale.groupBy({
      by: ['date'],
      _sum: { amount: true, qty: true },
      where: { date: { gte: addDays(now, -30) } },
    }),
    db.user.findMany({ orderBy: { points: 'desc' }, take: 5, select: { name: true, color: true, points: true, title: true } }),
    db.holiday.findMany({ where: { date: { gte: todayIso, lte: isoDay(addDays(now, 45)) } }, orderBy: { date: 'asc' } }),
    // ---- daily briefing ----
    db.order.findMany({
      where: { receivingDate: { gte: dayStart, lt: addDays(dayStart, 1) }, status: { notIn: ['CANCELLED', 'DONE'] } },
      orderBy: { code: 'asc' },
      take: 6,
      select: { code: true, providerName: true, status: true },
    }),
    db.cheque.findMany({
      where: { dueDate: { gte: dayStart, lt: addDays(dayStart, 1) }, status: { notIn: ['COLLECTED', 'REJECTED', 'CANCELLED'] } },
      orderBy: { dueDate: 'asc' },
      take: 4,
      select: { number: true, amount: true, payeeName: true },
    }),
    db.task.findMany({
      where: { assignedToId: user.id, status: { in: ['TODO', 'IN_PROGRESS', 'FOLLOW_UP'] } },
      orderBy: { dueDate: 'asc' },
      take: 8,
      select: { id: true, title: true, priority: true, dueDate: true, status: true },
    }),
    db.checklist.findMany({
      where: { active: true, OR: [{ roleKey: null }, { roleKey: { in: user.roleKeys } }] },
      orderBy: { createdAt: 'asc' },
      select: { id: true, title: true, items: true },
    }),
    // ---- open stock-count session (only meaningful for inventory+managers) ----
    canCount
      ? db.stockCount.findFirst({
          where: { status: 'IN_PROGRESS' },
          select: {
            code: true, scope: true, category: true, createdByName: true,
            items: { select: { countedQty: true } },
          },
        })
      : Promise.resolve(null),
  ])

  // which of my checklists are already completed today?
  const todayJKey = jalaliKey(now)
  const runsToday = myChecklists.length
    ? await db.checklistRun.findMany({
        where: { userId: user.id, day: todayJKey, checklistId: { in: myChecklists.map((c) => c.id) } },
        select: { checklistId: true, completedAt: true },
      })
    : []
  const doneIds = new Set(runsToday.filter((r) => r.completedAt).map((r) => r.checklistId))
  const checklists = myChecklists.map((c) => ({
    id: c.id,
    title: c.title,
    items: JSON.parse(c.items || '[]').length,
    done: doneIds.has(c.id),
  }))

  // sort open tasks by priority weight then dueDate
  const PRIORITY_WEIGHT: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
  const briefingTasks = [...myTasks]
    .sort((a, b) => (PRIORITY_WEIGHT[a.priority] ?? 2) - (PRIORITY_WEIGHT[b.priority] ?? 2))
    .slice(0, 4)

  // 14-day sales trend
  const trendMap = new Map<string, number>()
  for (const row of salesLast30) {
    trendMap.set(isoDay(row.date), (trendMap.get(isoDay(row.date)) ?? 0) + (row._sum.amount ?? 0))
  }
  const trend: { label: string; amount: number }[] = []
  for (let i = 13; i >= 0; i--) {
    const d = addDays(now, -i)
    const j = toJalali(d)
    trend.push({ label: toFaDigits(j.jd) + ' ' + JALALI_MONTHS[j.jm - 1].slice(0, 3), amount: Math.round(trendMap.get(isoDay(d)) ?? 0) })
  }

  const statusMap: Record<string, { count: number; amount: number }> = {}
  for (const g of orderStatusGroups) statusMap[g.status] = { count: g._count, amount: g._sum.finalAmount ?? 0 }

  return ok({
    todayOrders,
    pendingApprovals,
    lowStock,
    pendingCheques,
    tasksMine,
    unreadNotifs,
    overdueOrders,
    dueSoonCheques,
    statusMap,
    trend,
    teamPoints,
    holidays: holidayList,
    user: { points: user.points },
    briefing: {
      todayDeliveries,
      chequesDueToday,
      tasks: briefingTasks,
      checklists,
      stockCount: openStockCount
        ? {
            code: openStockCount.code,
            scope: openStockCount.scope,
            category: openStockCount.category,
            createdByName: openStockCount.createdByName,
            totalItems: openStockCount.items.length,
            countedItems: openStockCount.items.filter((i) => i.countedQty !== null).length,
          }
        : null,
    },
  })
}
