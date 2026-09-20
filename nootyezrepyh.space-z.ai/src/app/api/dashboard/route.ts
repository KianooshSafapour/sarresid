import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { toJalaali } from '@/lib/jalaali-core'
import { todayJalali as todayJalaliFn, addDaysJalali, jalaliWeekday, jalaliToDate, parseJalali, JALALI_WEEKDAYS } from '@/lib/jalali'

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()

  const users = await db.user.findMany({ where: { active: true }, orderBy: { name: 'asc' } })
  const staffList = users.map((u) => ({
    id: u.id,
    name: u.name,
    roles: JSON.parse(u.roles),
    primaryRole: u.primaryRole,
    color: u.color,
    points: u.points,
  }))

  const products = await db.product.findMany({ where: { active: true, mergedInto: null } })
  const companies = await db.company.findMany({ include: { suppliers: true, products: true } })
  const suppliers = await db.supplier.findMany({ include: { companies: true } })

  // stock alerts
  const critical = products.filter((p) => p.stock <= p.minStock * 0.5).length
  const low = products.filter((p) => p.stock > p.minStock * 0.5 && p.stock <= p.minStock).length

  // orders stats last 14 days
  const since = new Date(Date.now() - 14 * 86400000)
  const recentOrders = await db.order.findMany({
    where: { createdAt: { gte: since } },
    include: { items: true, supplier: true },
    orderBy: { createdAt: 'desc' },
  })
  const ordersPerDay: Record<string, number> = {}
  const spendPerDay: Record<string, number> = {}
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000)
    const key = `${d.getMonth() + 1}/${d.getDate()}`
    ordersPerDay[key] = 0
    spendPerDay[key] = 0
  }
  for (const o of recentOrders) {
    const d = new Date(o.createdAt)
    const key = `${d.getMonth() + 1}/${d.getDate()}`
    if (key in ordersPerDay) {
      ordersPerDay[key]++
      spendPerDay[key] += o.finalAmount || o.totalAmount
    }
  }

  const statusCounts: Record<string, number> = {}
  const allOrders = await db.order.findMany({ select: { status: true } })
  for (const o of allOrders) statusCounts[o.status] = (statusCounts[o.status] || 0) + 1

  // top ordered products
  const topProducts: Record<string, { name: string; qty: number; total: number }> = {}
  for (const o of recentOrders) {
    for (const item of o.items) {
      if (!topProducts[item.productName]) topProducts[item.productName] = { name: item.productName, qty: 0, total: 0 }
      topProducts[item.productName].qty += item.quantity
      topProducts[item.productName].total += item.lineTotal
    }
  }
  const topProductsList = Object.values(topProducts).sort((a, b) => b.qty - a.qty).slice(0, 7)

  // overdue orders
  const todayJalali = todayJalaliStr()
  const activeOrders = await db.order.findMany({
    where: { status: { in: ['APPROVED', 'EXPECTED'] } },
    select: { id: true, number: true, deliveryDate: true, supplier: { select: { name: true } } },
  })
  // overdue = delivery date before today (Jalali string compare works since format is fixed)
  const overdueOrders = activeOrders.filter((o) => o.deliveryDate < todayJalali)

  // cheques needing attention
  const pendingCheques = await db.cheque.findMany({ where: { status: 'PENDING_OWNER' } })
  const uncollectedCheques = await db.cheque.findMany({ where: { status: 'WRITTEN' } })

  // leaderboard
  const leaderboard = staffList.map((u) => ({ name: u.name, color: u.color, points: u.points })).sort((a, b) => b.points - a.points).slice(0, 8)

  // task stats
  const tasks = await db.task.findMany({ select: { status: true, assignedTo: true } })
  const openTasks = tasks.filter((t) => t.status !== 'DONE').length
  const myTasks = tasks.filter((t) => t.assignedTo === session.id && t.status !== 'DONE').length

  // spend by supplier
  const spendBySupplier: Record<string, number> = {}
  for (const o of recentOrders) {
    spendBySupplier[o.supplier.name] = (spendBySupplier[o.supplier.name] || 0) + (o.finalAmount || o.totalAmount)
  }

  // today's POS sales (Tehran calendar day) + pipeline snapshot
  const tehranNow = new Date(Date.now() + 3.5 * 3600000)
  const dayStartUtc = Date.UTC(tehranNow.getFullYear(), tehranNow.getMonth(), tehranNow.getDate()) - 3.5 * 3600000
  const dayEndUtc = dayStartUtc + 24 * 3600000
  const cashedToday = await db.saleOrder.findMany({
    where: { status: 'CASHED', cashedAt: { gte: new Date(dayStartUtc), lt: new Date(dayEndUtc) } },
    select: { total: true },
  })
  const todaySales = cashedToday.reduce((s, o) => s + o.total, 0)

  // POS cashed-sales trend — last 14 Tehran calendar days (keyed "M/D" like ordersPerDay)
  const salesPerDay: Record<string, number> = {}
  const salesCountPerDay: Record<string, number> = {}
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() + 3.5 * 3600000 - i * 86400000)
    const key = `${d.getMonth() + 1}/${d.getDate()}`
    salesPerDay[key] = 0
    salesCountPerDay[key] = 0
  }
  const trendSales = await db.saleOrder.findMany({
    where: { status: 'CASHED', cashedAt: { gte: new Date(Date.now() - 14 * 86400000) } },
    select: { total: true, cashedAt: true },
  })
  for (const s of trendSales) {
    if (!s.cashedAt) continue
    const t = new Date(s.cashedAt.getTime() + 3.5 * 3600000)
    const key = `${t.getUTCMonth() + 1}/${t.getUTCDate()}`
    if (key in salesPerDay) {
      salesPerDay[key] += s.total
      salesCountPerDay[key]++
    }
  }

  const pendingSales = await db.saleOrder.count({ where: { status: { in: ['PENDING', 'ACCEPTED'] } } })
  const activeOrdersCount = await db.order.count({ where: { status: { in: ['APPROVED', 'EXPECTED', 'RECEIVED', 'INSPECTED', 'TO_HOLOO'] } } })

  // Jalali week-over-week (شنبه–جمعه), Tehran calendar — server-side so weeks align exactly
  const todayJ = todayJalaliFn()
  const wd = jalaliWeekday(todayJ) // 0=شنبه
  const weekStartJ = addDaysJalali(todayJ, -wd)
  const weekEndJ = addDaysJalali(weekStartJ, 6)
  const prevStartJ = addDaysJalali(weekStartJ, -7)
  const prevEndJ = addDaysJalali(weekStartJ, -1)
  const jalaliMidnightUtc = (j: string) => {
    const p = parseJalali(j)
    if (!p) return Date.now()
    const d = jalaliToDate(p.jy, p.jm, p.jd) // local noon — round-trips day regardless of server tz
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - 3.5 * 3600000
  }
  const weekStartMs = jalaliMidnightUtc(weekStartJ)
  const prevStartMs = weekStartMs - 7 * 86400000
  const weekSales = await db.saleOrder.findMany({
    where: { status: 'CASHED', cashedAt: { gte: new Date(prevStartMs) } },
    select: { total: true, cashedAt: true },
  })
  let salesThisWeek = 0, salesLastWeek = 0, thisWeekCount = 0, lastWeekCount = 0
  const perWeekday: { total: number; count: number }[] = Array.from({ length: 7 }, () => ({ total: 0, count: 0 }))
  for (const s of weekSales) {
    if (!s.cashedAt) continue
    const t = s.cashedAt.getTime()
    if (t >= weekStartMs) {
      salesThisWeek += s.total
      thisWeekCount++
      const idx = Math.min(6, Math.max(0, Math.floor((t - weekStartMs) / 86400000)))
      perWeekday[idx].total += s.total
      perWeekday[idx].count++
    } else {
      salesLastWeek += s.total
      lastWeekCount++
    }
  }
  let bestDay: { idx: number; day: string; total: number; count: number } | null = null
  for (let idx = 0; idx < perWeekday.length; idx++) {
    const d = perWeekday[idx]
    if (d.count > 0 && (!bestDay || d.total > bestDay.total)) bestDay = { idx, day: JALALI_WEEKDAYS[idx], total: d.total, count: d.count }
  }
  const salesWeek = {
    thisWeek: salesThisWeek,
    lastWeek: salesLastWeek,
    thisWeekCount,
    lastWeekCount,
    weekStartJalali: weekStartJ,
    weekEndJalali: weekEndJ,
    prevWeekStartJalali: prevStartJ,
    prevWeekEndJalali: prevEndJ,
    todayIdx: wd,
    bestDay,
  }

  return Response.json({
    staffCount: staffList.length,
    productCount: products.length,
    supplierCount: suppliers.length,
    companyCount: companies.length,
    criticalStock: critical,
    lowStock: low,
    todaySales,
    todaySalesCount: cashedToday.length,
    salesPerDay,
    salesCountPerDay,
    salesWeek,
    pendingSales,
    activeOrders: activeOrdersCount,
    ordersPerDay,
    spendPerDay,
    statusCounts,
    topProducts: topProductsList,
    overdueOrders,
    pendingCheques: pendingCheques.length,
    uncollectedCheques: uncollectedCheques.length,
    leaderboard,
    openTasks,
    myTasks,
    spendBySupplier,
    recentOrders: recentOrders.slice(0, 6).map((o) => ({
      id: o.id,
      number: o.number,
      supplier: o.supplier.name,
      status: o.status,
      total: o.finalAmount || o.totalAmount,
      createdAt: o.createdAt,
      deliveryDate: o.deliveryDate,
    })),
  })
}

function todayJalaliStr(): string {
  const t = new Date(Date.now() + 3.5 * 3600000)
  const { jy, jm, jd } = toJalaali(t.getFullYear(), t.getMonth() + 1, t.getDate())
  return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`
}
