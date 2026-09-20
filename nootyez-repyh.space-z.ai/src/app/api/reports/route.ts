import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const since = new Date(Date.now() - 30 * 86400000)

    const [orders, products, users, auditLogs, points, items, sales30, costMap] = await Promise.all([
      db.order.findMany({
        where: { status: { not: 'CANCELLED' } },
        include: { supplier: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      db.product.findMany({ where: { active: true, mergedInto: null }, include: { supplier: { select: { name: true } } } }),
      db.user.findMany({ select: { id: true, name: true, color: true, points: true, roles: true } }),
      db.auditLog.findMany({ where: { createdAt: { gte: since } }, select: { userId: true, userName: true } }),
      db.pointsLog.findMany({ select: { userId: true, points: true } }),
      db.orderItem.findMany({ select: { status: true, orderId: true, qty: true, deliveredQty: true, unitCost: true, finalCost: true } }),
      // register sales of the last 30 days (Holoo import + POS quick-log + preorders)
      db.sale.findMany({
        where: { createdAt: { gte: since } },
        select: { productId: true, name: true, qty: true, unitPrice: true, total: true },
      }),
      // full cost basis map (include inactive — a sold product may be deactivated later)
      db.product.findMany({ select: { id: true, name: true, nameFa: true, buyPrice: true } }),
    ])

    // ---- Delivery performance ----
    const withTimes = orders.filter((o) => o.receivedAt && o.createdAt)
    const receiveLags = withTimes.map((o) => (new Date(o.receivedAt!).getTime() - new Date(o.createdAt).getTime()) / 3600000)
    const confirmLags = orders.filter((o) => o.confirmedAt && o.receivedAt).map((o) => (new Date(o.confirmedAt!).getTime() - new Date(o.receivedAt!).getTime()) / 3600000)
    const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0)
    const onTime = withTimes.filter((o) => new Date(o.receivedAt!).getTime() <= new Date(o.receivingDate).getTime() + 86400000).length

    const delivery = {
      avgReceiveLagH: Math.round(avg(receiveLags) * 10) / 10,
      avgConfirmLagH: Math.round(avg(confirmLags) * 10) / 10,
      onTimePct: withTimes.length ? Math.round((onTime / withTimes.length) * 100) : 100,
      receivedCount: withTimes.length,
    }

    // ---- Supplier scorecard ----
    const missingByOrder = new Map<number, { missing: number; rejected: number; lines: number }>()
    for (const it of items) {
      const rec = missingByOrder.get(it.orderId) ?? { missing: 0, rejected: 0, lines: 0 }
      if (it.status === 'MISSING') rec.missing++
      if (it.status === 'REJECTED') rec.rejected++
      rec.lines++
      missingByOrder.set(it.orderId, rec)
    }
    const suppliers = new Map<string, { name: string; orders: number; spend: number; missing: number; rejected: number; lines: number }>()
    for (const o of orders) {
      const name = o.supplier?.name ?? '—'
      const rec = suppliers.get(name) ?? { name, orders: 0, spend: 0, missing: 0, rejected: 0, lines: 0 }
      rec.orders++
      rec.spend += o.total
      const m = missingByOrder.get(o.id)
      if (m) { rec.missing += m.missing; rec.rejected += m.rejected; rec.lines += m.lines }
      suppliers.set(name, rec)
    }
    const supplierScorecard = [...suppliers.values()]
      .map((s) => ({ ...s, spend: Math.round(s.spend), issueRate: s.lines ? Math.round(((s.missing + s.rejected) / s.lines) * 1000) / 10 : 0 }))
      .sort((a, b) => b.spend - a.spend)

    // ---- Monthly spend (last 6 months, DONE orders) ----
    const months = new Map<string, number>()
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, 0)
    }
    for (const o of orders) {
      if (!o.doneAt) continue
      const d = new Date(o.doneAt)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (months.has(key)) months.set(key, (months.get(key) ?? 0) + o.total)
    }
    const monthlySpend = [...months.entries()].map(([key, total]) => ({ month: key, total: Math.round(total) }))

    // ---- Staff activity (last 30d) ----
    const activityByUser = new Map<number, { name: string; color: string; actions: number }>()
    for (const a of auditLogs) {
      const u = users.find((x) => x.id === a.userId)
      const rec = activityByUser.get(a.userId) ?? { name: a.userName, color: u?.color ?? '#5F7A4E', actions: 0 }
      rec.actions++
      activityByUser.set(a.userId, rec)
    }
    const pointsByUser = new Map<number, number>()
    for (const p of points) pointsByUser.set(p.userId, (pointsByUser.get(p.userId) ?? 0) + p.points)

    const staffActivity = [...activityByUser.entries()]
      .map(([id, rec]) => ({ id, ...rec, points: pointsByUser.get(id) ?? 0 }))
      .sort((a, b) => b.actions - a.actions)
      .slice(0, 12)

    // ---- Product margin analysis (mirrors Mrs. Darvishi's Excel margin logic) ----
    const margins = products
      .filter((p) => p.sellPrice > 0)
      .map((p) => ({
        id: p.id,
        name: p.name,
        nameFa: p.nameFa,
        supplier: p.supplier?.name ?? '—',
        buyPrice: p.buyPrice,
        sellPrice: p.sellPrice,
        marginPct: Math.round(((p.sellPrice - p.buyPrice) / p.sellPrice) * 1000) / 10,
        stock: p.stock,
        minStock: p.minStock,
      }))
      .sort((a, b) => b.marginPct - a.marginPct)
    const marginTop = margins.slice(0, 12)
    const marginRisk = margins.filter((m) => m.marginPct < 10).slice(0, 8)

    // ---- Order funnel ----
    const statusFlow = ['DRAFT', 'SUBMITTED', 'APPROVED', 'RECEIVED', 'CONFIRMED', 'DONE'] as const
    const funnel = statusFlow.map((status) => ({ status, count: orders.filter((o) => o.status === status).length }))

    // ---- Financial snapshot ----
    const doneOrders = orders.filter((o) => o.status === 'DONE')
    const totalSpend30d = Math.round(doneOrders.filter((o) => o.doneAt && new Date(o.doneAt) >= since).reduce((s, o) => s + o.total, 0))
    const estVat30d = Math.round(totalSpend30d - totalSpend30d / 1.09) // VAT-inclusive estimate
    const openCommitments = Math.round(orders.filter((o) => !['DONE', 'CANCELLED'].includes(o.status)).reduce((s, o) => s + o.total, 0))

    // ---- Sales margin analysis (30d) — cost basis = Product.buyPrice via Sale.productId ----
    const costById = new Map(costMap.map((p) => [p.id, p]))
    const saleAgg = new Map<number, { id: number; name: string; nameFa: string | null; qty: number; revenue: number; cost: number }>()
    let revenue30d = 0
    let revenueKnown = 0
    let costKnown = 0
    for (const s of sales30) {
      const qty = Number(s.qty ?? 0)
      const revenue = Number(s.total ?? 0)
      revenue30d += revenue
      const pid = s.productId ?? null
      const p = pid ? costById.get(pid) : undefined
      if (!p) continue // no cost basis (name-only sale) → excluded from margin math
      revenueKnown += revenue
      const cost = (Number(p.buyPrice ?? 0)) * qty
      costKnown += cost
      const rec = saleAgg.get(p.id) ?? { id: p.id, name: p.name, nameFa: p.nameFa, qty: 0, revenue: 0, cost: 0 }
      rec.qty += qty
      rec.revenue += revenue
      rec.cost += cost
      saleAgg.set(p.id, rec)
    }
    const pct = (rev: number, cost: number) => (rev > 0 ? Math.round(((rev - cost) / rev) * 1000) / 10 : 0)
    const salesMargin = {
      revenue30d: Math.round(revenue30d),
      marginPct: pct(revenueKnown, costKnown),
      marginValue: Math.round(revenueKnown - costKnown),
      unknownPct: revenue30d > 0 ? Math.round(((revenue30d - revenueKnown) / revenue30d) * 1000) / 10 : 0,
      productsCounted: saleAgg.size,
      top: [...saleAgg.values()]
        .map((r) => ({ ...r, revenue: Math.round(r.revenue), marginPct: pct(r.revenue, r.cost) }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 8),
      risk: [...saleAgg.values()]
        .map((r) => ({ ...r, revenue: Math.round(r.revenue), marginPct: pct(r.revenue, r.cost) }))
        .filter((r) => r.marginPct < 10)
        .sort((a, b) => a.marginPct - b.marginPct)
        .slice(0, 6),
    }

    return NextResponse.json({
      delivery,
      supplierScorecard,
      monthlySpend,
      staffActivity,
      marginTop,
      marginRisk,
      funnel,
      financial: { totalSpend30d, estVat30d, openCommitments, ordersDone: doneOrders.length },
      salesMargin,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'reports failed' }, { status: 500 })
  }
}
