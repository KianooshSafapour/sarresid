import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

const ACTIVE_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'RECEIVED', 'CONFIRMED']
const pad = (n: number) => String(n).padStart(2, '0')

// GET /api/dashboard → aggregate stats for the main dashboard
export async function GET() {
  try {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const in7Days = new Date(todayStart.getTime() + 7 * 24 * 3600 * 1000)
    const days14Ago = new Date(todayStart.getTime() - 13 * 24 * 3600 * 1000)
    const todayISO = now.toISOString().slice(0, 10)

    const [
      ordersActive,
      ordersToday,
      products,
      chequesPendingOwner,
      chequesDueSoon,
      tasksOpen,
      preordersPending,
      customers,
      ordersByStatusRaw,
      recentOrders,
      recentEvents,
      staff,
      holidays,
      supplierGroups,
      salesTodayAgg,
      salesTodayRows,
      sales14Rows,
      shiftRow,
    ] = await Promise.all([
      db.order.count({ where: { status: { in: ACTIVE_STATUSES } } }),
      db.order.count({ where: { receivingDate: { gte: todayStart, lt: tomorrowStart }, status: { in: ACTIVE_STATUSES } } }),
      db.product.findMany({ select: { id: true, name: true, nameFa: true, stock: true, minStock: true, mergedInto: true } }),
      db.cheque.count({ where: { status: 'PENDING_APPROVAL' } }),
      db.cheque.count({ where: { status: { in: ['WRITTEN', 'SIGNED', 'GIVEN'] }, dueDate: { gte: todayStart, lte: in7Days } } }),
      db.task.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS', 'PAUSED'] } } }),
      db.preOrder.count({ where: { status: 'PENDING' } }),
      db.customer.count(),
      db.order.groupBy({ by: ['status'], _count: { _all: true } }),
      db.order.findMany({
        where: { createdAt: { gte: days14Ago } },
        select: { createdAt: true, total: true, supplierId: true, status: true },
      }),
      db.orderEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 12, include: { order: { select: { code: true } } } }),
      db.user.findMany({ orderBy: { points: 'desc' }, take: 8, select: { name: true, points: true, color: true } }),
      db.holiday.findMany({ where: { date: { gte: todayISO } }, orderBy: { date: 'asc' }, take: 10, select: { date: true, title: true } }),
      db.order.groupBy({ by: ['supplierId'], _count: { _all: true }, _sum: { total: true } }),
      // ---- sales pulse (same server-local calendar day as todayStart) ----
      db.sale.aggregate({ where: { createdAt: { gte: todayStart, lt: tomorrowStart } }, _sum: { total: true }, _count: true }),
      db.sale.findMany({ where: { createdAt: { gte: todayStart, lt: tomorrowStart } }, select: { total: true, salespersonId: true } }),
      db.sale.findMany({ where: { createdAt: { gte: days14Ago } }, select: { createdAt: true, total: true } }),
      db.setting.findUnique({ where: { key: 'shiftHours' } }),
    ])

    const lowStockItems = products
      .filter((p) => !p.mergedInto && p.stock <= p.minStock)
      .map((p) => ({ name: p.nameFa || p.name, stock: p.stock, minStock: p.minStock }))
      .slice(0, 8)

    const ordersByStatus = ordersByStatusRaw.map((g) => ({ status: g.status, count: g._count._all }))

    // ---- 14-day buckets ----
    const buckets: Array<{ date: string; count: number; total: number }> = []
    for (let i = 0; i < 14; i++) {
      const d = new Date(days14Ago.getTime() + i * 24 * 3600 * 1000)
      buckets.push({ date: `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`, count: 0, total: 0 })
    }
    const dayKey = (d: Date) => `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
    const keyToIdx = new Map(buckets.map((b, i) => [b.date, i]))
    for (const o of recentOrders) {
      const idx = keyToIdx.get(dayKey(new Date(o.createdAt)))
      if (idx != null) {
        buckets[idx].count++
        buckets[idx].total += o.total
      }
    }
    const ordersPerDay = buckets.map((b) => ({ date: b.date, count: b.count, total: b.total }))
    const spendPerDay = buckets.map((b) => ({ date: b.date, total: Math.round(b.total) }))

    // ---- sales pulse ----
    const isoDayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const todayTotal = Math.round(salesTodayAgg._sum.total ?? 0)
    const todayCount = salesTodayAgg._count ?? 0
    const sellersToday = new Set(salesTodayRows.map((r) => r.salespersonId)).size
    const shiftVal = parseFloat(shiftRow?.value ?? '')
    const shiftHours = Number.isFinite(shiftVal) && shiftVal > 0 ? shiftVal : 8
    const sphl = sellersToday > 0 ? Math.max(0, Math.round(todayTotal / (sellersToday * shiftHours))) : 0

    // today's best seller by total
    const sellerAgg = new Map<number, number>()
    for (const r of salesTodayRows) sellerAgg.set(r.salespersonId, (sellerAgg.get(r.salespersonId) ?? 0) + r.total)
    let topSeller: { name: string; total: number } | null = null
    if (sellerAgg.size > 0) {
      const [topId, topTotal] = [...sellerAgg.entries()].sort((a, b) => b[1] - a[1])[0]
      const u = await db.user.findUnique({ where: { id: topId }, select: { name: true } })
      topSeller = { name: u?.name ?? `کاربر #${topId}`, total: Math.round(topTotal) }
    }

    // byDay — last 14 days (oldest→today), missing days 0 (mirrors /api/sales summary)
    const saleDayTotals = new Map<string, number>()
    for (const r of sales14Rows) {
      const k = isoDayKey(new Date(r.createdAt))
      saleDayTotals.set(k, (saleDayTotals.get(k) ?? 0) + r.total)
    }
    const byDay: { day: string; total: number }[] = []
    for (let i = 13; i >= 0; i--) {
      const k = isoDayKey(new Date(todayStart.getTime() - i * 24 * 3600 * 1000))
      byDay.push({ day: k, total: Math.round(saleDayTotals.get(k) ?? 0) })
    }

    // ---- top suppliers ----
    const supplierIds = supplierGroups.map((g) => g.supplierId)
    const suppliers = await db.supplier.findMany({
      where: { id: { in: supplierIds } },
      select: { id: true, name: true },
    })
    const supName = new Map(suppliers.map((s) => [s.id, s.name]))
    const topSuppliers = supplierGroups
      .map((g) => ({
        name: supName.get(g.supplierId) ?? `#${g.supplierId}`,
        count: g._count._all,
        total: Math.round(g._sum.total ?? 0),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    return NextResponse.json({
      counts: {
        ordersActive,
        ordersToday,
        lowStock: products.filter((p) => !p.mergedInto && p.stock <= p.minStock).length,
        chequesPendingOwner,
        chequesDueSoon,
        tasksOpen,
        preordersPending,
        customers,
      },
      ordersByStatus,
      ordersPerDay,
      spendPerDay,
      topSuppliers,
      lowStockItems,
      recentEvents: recentEvents.map((ev) => ({
        id: ev.id,
        orderId: ev.orderId,
        code: ev.order?.code ?? '',
        userName: ev.userName,
        action: ev.action,
        detail: ev.detail,
        createdAt: ev.createdAt,
      })),
      staffPoints: staff.map((u) => ({ name: u.name, points: u.points, color: u.color })),
      holidays: holidays.map((h) => ({ date: h.date, title: h.title })),
      sales: {
        todayTotal,
        todayCount,
        sphl,
        topSeller,
        byDay,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}
