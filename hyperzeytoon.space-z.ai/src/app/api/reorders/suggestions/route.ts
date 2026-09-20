import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok } from '@/lib/server-utils'

// ============================================================
// GET /api/reorders/suggestions
// Scientific smart reorder engine (inventory-theory based):
//   - demand forecast = weighted moving average of daily sales
//     (last 7d ×0.6 + previous 7d ×0.3 + previous 14d ×0.1)
//     → more responsive than a flat mean, less noisy than 7d only
//   - safety stock = z × σ_daily × √L   (z=1.65 → 95% service level,
//     L = replenishment lead time in days)
//   - reorder point = forecast_daily × L + safety stock
//   - suggested quantity = forecast×targetDays + SS − stock (≥1)
//   - urgency by days-of-cover (CRITICAL ≤2 / WARN ≤4 / SOON ≤7)
//   - each item carries its last-ordered provider (from Order history)
//     and the response groups suggestions per supplier
// ============================================================

const RECENT = 7
const MID = 7
const OLD = 14
const TARGET_DAYS = 14   // desired cover after the reorder arrives
const LEAD_TIME_DAYS = 3 // replenishment lead time (كارا برای پخش محلی)
const SERVICE_Z = 1.65   // 95% service level (normal distribution)

const URGENCY_WEIGHT: Record<string, number> = { CRITICAL: 0, WARN: 1, SOON: 2 }

function daysAgo(n: number): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)

  const [products, dailySales] = await Promise.all([
    db.product.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true, name: true, unit: true, category: true, brand: true,
        stock: true, minStock: true, buyPrice: true,
      },
    }),
    db.productSale.groupBy({
      by: ['productId', 'date'],
      _sum: { qty: true },
      where: { date: { gte: daysAgo(RECENT + MID + OLD) } },
    }),
  ])

  // productId → Map<dayIndex, qty> (0 = today)
  const dayMap = new Map<string, Map<number, number>>()
  for (const row of dailySales) {
    const dayDiff = Math.floor((daysAgo(0).getTime() - new Date(row.date).setHours(0, 0, 0, 0)) / 86400000)
    let m = dayMap.get(row.productId)
    if (!m) {
      m = new Map()
      dayMap.set(row.productId, m)
    }
    m.set(dayDiff, (m.get(dayDiff) ?? 0) + (row._sum.qty ?? 0))
  }

  // forecast + σ per product
  const stats = new Map<string, { forecastDaily: number; sigma: number; avgDaily14: number }>()
  for (const p of products) {
    const m = dayMap.get(p.id)
    if (!m) {
      stats.set(p.id, { forecastDaily: 0, sigma: 0, avgDaily14: 0 })
      continue
    }
    const sumRange = (from: number, to: number) => {
      let s = 0
      for (let d = from; d < to; d++) s += m.get(d) ?? 0
      return s
    }
    const recent7 = sumRange(0, RECENT) / RECENT
    const mid7 = sumRange(RECENT, RECENT + MID) / MID
    const old14 = sumRange(RECENT + MID, RECENT + MID + OLD) / OLD
    const forecastDaily = recent7 * 0.6 + mid7 * 0.3 + old14 * 0.1
    const avgDaily14 = (recent7 + mid7) / (RECENT + MID)
    // σ over the last 14 daily buckets
    const values: number[] = []
    for (let d = 0; d < RECENT + MID; d++) values.push(m.get(d) ?? 0)
    const mean = values.reduce((s, v) => s + v, 0) / values.length
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
    stats.set(p.id, { forecastDaily, sigma: Math.sqrt(variance), avgDaily14 })
  }

  // last-ordered provider per product (latest non-cancelled order wins)
  // note: OrderItem.productId is nullable (free-text custom lines) → filter to real product links
  const LAST_ORDER_EXCLUDED = new Set(['CANCELLED', 'REJECTED'])
  const orderHistory = await db.orderItem.findMany({
    where: { productId: { not: null }, product: { status: 'ACTIVE' } },
    select: {
      productId: true,
      order: {
        select: { providerId: true, providerName: true, createdAt: true, status: true },
      },
    },
    orderBy: { order: { createdAt: 'desc' } },
  })
  const providerMap = new Map<string, { providerId: string | null; providerName: string | null }>()
  for (const oi of orderHistory) {
    if (!oi.productId) continue
    if (providerMap.has(oi.productId)) continue
    if (LAST_ORDER_EXCLUDED.has(oi.order.status)) continue
    providerMap.set(oi.productId, {
      providerId: oi.order.providerId ?? null,
      providerName: oi.order.providerName ?? null,
    })
  }

  const items = [] as {
    id: string; name: string; unit: string; category: string; brand: string | null
    stock: number; minStock: number; buyPrice: number
    sold14: number; avgDaily: number; forecastDaily: number
    safetyStock: number; reorderPoint: number
    daysCover: number | null
    suggestedQty: number; urgency: 'CRITICAL' | 'WARN' | 'SOON'; estCost: number
    providerId: string | null; providerName: string | null
  }[]

  for (const p of products) {
    const st = stats.get(p.id) ?? { forecastDaily: 0, sigma: 0, avgDaily14: 0 }
    const forecastDaily = st.forecastDaily
    const safetyStock = Math.ceil(SERVICE_Z * st.sigma * Math.sqrt(LEAD_TIME_DAYS))
    const reorderPoint = Math.ceil(forecastDaily * LEAD_TIME_DAYS) + safetyStock
    const daysCover = forecastDaily > 0 ? p.stock / forecastDaily : null
    const belowMin = p.stock <= p.minStock
    const belowROP = forecastDaily > 0 && p.stock <= reorderPoint
    if (!belowMin && !belowROP) continue

    const target = Math.ceil(forecastDaily * TARGET_DAYS) + safetyStock
    const suggestedQty = Math.max(1, target - p.stock)
    const urgency: 'CRITICAL' | 'WARN' | 'SOON' =
      p.stock <= 0 || (daysCover !== null && daysCover <= 2)
        ? 'CRITICAL'
        : (daysCover !== null && daysCover <= 4) || belowMin
          ? 'WARN'
          : 'SOON'

    const prov = providerMap.get(p.id) ?? { providerId: null, providerName: null }
    items.push({
      id: p.id, name: p.name, unit: p.unit, category: p.category, brand: p.brand,
      stock: p.stock, minStock: p.minStock, buyPrice: p.buyPrice,
      sold14: Math.round(st.avgDaily14 * (RECENT + MID)),
      avgDaily: Math.round(st.avgDaily14 * 100) / 100,
      forecastDaily: Math.round(forecastDaily * 100) / 100,
      safetyStock, reorderPoint,
      daysCover: daysCover === null ? null : Math.round(daysCover * 10) / 10,
      suggestedQty, urgency,
      estCost: Math.round(suggestedQty * p.buyPrice),
      providerId: prov.providerId,
      providerName: prov.providerName,
    })
  }

  items.sort((a, b) => {
    const w = (URGENCY_WEIGHT[a.urgency] ?? 3) - (URGENCY_WEIGHT[b.urgency] ?? 3)
    if (w !== 0) return w
    const ca = a.daysCover === null ? 999 : a.daysCover
    const cb = b.daysCover === null ? 999 : b.daysCover
    return ca - cb
  })

  const summary = {
    critical: items.filter((i) => i.urgency === 'CRITICAL').length,
    warn: items.filter((i) => i.urgency === 'WARN').length,
    soon: items.filter((i) => i.urgency === 'SOON').length,
    totalQty: items.reduce((s, i) => s + i.suggestedQty, 0),
    estCost: items.reduce((s, i) => s + i.estCost, 0),
  }

  // group suggestions by last-ordered provider (unnamed last → «بدون تأمین‌کننده» bucket)
  const groupMap = new Map<string, { providerId: string | null; providerName: string; itemCount: number; totalQty: number; estCost: number }>()
  for (const i of items) {
    const key = i.providerId ?? '_none'
    const g = groupMap.get(key) ?? {
      providerId: i.providerId,
      providerName: i.providerName ?? 'بدون تأمین‌کننده',
      itemCount: 0, totalQty: 0, estCost: 0,
    }
    g.itemCount++
    g.totalQty += i.suggestedQty
    g.estCost += i.estCost
    groupMap.set(key, g)
  }
  const providerGroups = [...groupMap.values()].sort((a, b) => b.estCost - a.estCost)

  return ok({
    items, summary, providerGroups,
    allSameProvider: providerGroups.length === 1 && providerGroups[0].providerId !== null,
    windowDays: RECENT + MID, targetDays: TARGET_DAYS,
    model: {
      method: 'میانگین متحرک وزن‌دار + ذخیره اطمینان',
      weights: { recent7: 0.6, mid7: 0.3, old14: 0.1 },
      leadTimeDays: LEAD_TIME_DAYS,
      serviceLevel: 0.95,
      zScore: SERVICE_Z,
      formulaFa: 'ذخیره اطمینان = ۱٫۶۵ × انحراف معیار فروش روزانه × √زمان تأمین',
    },
  })
}
