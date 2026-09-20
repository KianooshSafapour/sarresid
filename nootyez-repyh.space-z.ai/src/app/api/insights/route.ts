import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * تحلیل هوشمند انبار | Smart Inventory Insights
 *
 * Research basis: ABC/VEN classification (PMC), reorder point & safety stock
 * (Ayalew 2025), slow-mover identification + markdown pricing for near-stale
 * stock (T&F). Computed server-side from live data (active non-merged
 * products only).
 *
 * GET /api/insights?userId=
 *   → role-gated (INVENTORY_SUPERVISOR | PRODUCT_MANAGER | OWNER |
 *     GENERAL_MANAGER | OPERATION_MANAGER | IT_ADMIN) → 403 otherwise.
 *   → {
 *       generatedAt,
 *       demandSource: 'SALES' | 'ORDERITEMS',
 *       counts: { A, B, C, reorder, slow },
 *       abc: { A: {count, revenueShare}, B: {…}, C: {…}, topAItems: [5 names],
 *              classes: [{class, count, revenueShare}], topA: [names] },
 *              (classes/topA are additive aliases kept for the Warehouse UI)
 *       reorder: [{productId, name, stock, minStock, avgDailyDemand,
 *                  suggestQty, supplierName}] (top 12 by urgency),
 *       slow: [{productId, name, stock, stockValue, sellPrice}] (top 10 by
 *              stock value — markdown candidates, no sales in 60d),
 *       expiring: [{productId, name, qty, receivedAt, expiryDate, daysLeft,
 *                   stockValue, suggestMarkdown}] — FEFO: products with
 *                   shelfLifeDays whose last received batch expires ≤21d
 *                   (research: FEFO minimizes perishable loss — MDPI;
 *                     expiration-based markdown — T&F/PMC),
 *     }
 *   → ABC: revenue per product over 60d Sales (fallback: OrderItems of
 *     DONE/CONFIRMED orders over 90d when Sales are sparse); cumulative
 *     share → A ≤80%, B ≤95%, C rest.
 *   → Reorder: stock ≤ max(minStock, ROP), ROP = avgDailyDemand×3 + minStock;
 *     avgDailyDemand = qty sold/day (30d, min 0.1 when any sales);
 *     suggestQty = max(minStock×1.5 − stock, 1) rounded.
 *   → Audits INSIGHTS_VIEWED (entity 'Product') when userId is present.
 */

const MGMT_ROLES = ['OWNER', 'GENERAL_MANAGER', 'OPERATION_MANAGER', 'IT_ADMIN']
const VIEW_ROLES = [...MGMT_ROLES, 'INVENTORY_SUPERVISOR', 'PRODUCT_MANAGER']

const FORBIDDEN = { error: 'دسترسی به تحلیل هوشمند انبار برای نقش شما مجاز نیست | Forbidden' }

const LEAD_DAYS = 3
/** Sales considered "sparse" → fall back to OrderItems revenue */
const MIN_SALES_PRODUCTS = 3
/** FEFO: flag items expiring within this many days */
const EXPIRY_WINDOW_DAYS = 21
/** FEFO: suggest markdown when expiring within this many days */
const MARKDOWN_DAYS = 10

async function audit(
  userId: number | null | undefined,
  action: string,
  entity: string,
  entityId: number | null,
  detail?: string
) {
  let userName = 'سیستم'
  if (userId) {
    const u = await db.user.findUnique({ where: { id: userId }, select: { name: true } })
    if (u) userName = u.name
  }
  await db.auditLog.create({
    data: { userId: userId ?? 0, userName, action, entity, entityId, detail: detail ?? null },
  })
}

function hasAny(roles: string, allowed: string[]): boolean {
  return roles.split(',').map((r) => r.trim()).some((r) => allowed.includes(r))
}

const r2 = (n: number) => Math.round(n * 100) / 100

// GET /api/insights?userId=
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams
  const userId = Number(sp.get('userId'))
  let user: { id: number; name: string; roles: string; active: boolean } | null = null
  if (Number.isFinite(userId) && userId > 0) {
    try {
      user = await db.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, roles: true, active: true },
      })
    } catch {
      user = null
    }
  }
  if (!user || !user.active || !hasAny(user.roles, VIEW_ROLES)) {
    return NextResponse.json(FORBIDDEN, { status: 403 })
  }

  try {
    const now = Date.now()
    const since30 = new Date(now - 30 * 86400000)
    const since60 = new Date(now - 60 * 86400000)
    const since90 = new Date(now - 90 * 86400000)

    const products = await db.product.findMany({
      where: { active: true, mergedInto: null },
      select: {
        id: true, name: true, stock: true, minStock: true,
        sellPrice: true, buyPrice: true, shelfLifeDays: true,
        supplier: { select: { name: true } },
      },
    })

    const sales60 = await db.sale.findMany({
      where: { createdAt: { gte: since60 } },
      select: { productId: true, qty: true, total: true, createdAt: true },
    })

    // ---------- revenue per product (ABC) ----------
    let revMap = new Map<number, number>()
    for (const s of sales60) {
      if (s.productId == null) continue
      revMap.set(s.productId, (revMap.get(s.productId) ?? 0) + s.total)
    }
    let demandSource: 'SALES' | 'ORDERITEMS' = 'SALES'
    const salesRevenue = [...revMap.values()].reduce((a, b) => a + b, 0)
    if (revMap.size < MIN_SALES_PRODUCTS || salesRevenue <= 0) {
      // fallback: OrderItems sellPrice×qty of DONE/CONFIRMED orders (90d)
      demandSource = 'ORDERITEMS'
      revMap = new Map()
      const orders = await db.order.findMany({
        where: { status: { in: ['DONE', 'CONFIRMED'] }, createdAt: { gte: since90 } },
        select: { items: { select: { productId: true, qty: true, sellPrice: true } } },
      })
      for (const o of orders) {
        for (const it of o.items) {
          if (it.productId == null) continue
          revMap.set(it.productId, (revMap.get(it.productId) ?? 0) + it.sellPrice * it.qty)
        }
      }
    }

    // ---------- ABC classification ----------
    const sorted = products
      .map((p) => ({ id: p.id, name: p.name, revenue: revMap.get(p.id) ?? 0 }))
      .sort((a, b) => b.revenue - a.revenue)
    const totalRev = sorted.reduce((a, x) => a + x.revenue, 0)

    const classCount = { A: 0, B: 0, C: 0 }
    const classRev = { A: 0, B: 0, C: 0 }
    let cum = 0
    const topA: string[] = []
    for (const it of sorted) {
      cum += it.revenue
      const share = totalRev > 0 ? cum / totalRev : 1
      const klass: 'A' | 'B' | 'C' = share <= 0.8 ? 'A' : share <= 0.95 ? 'B' : 'C'
      classCount[klass]++
      classRev[klass] += it.revenue
      if (klass === 'A' && topA.length < 5) topA.push(it.name)
    }
    const shareOf = (k: 'A' | 'B' | 'C') =>
      totalRev > 0 ? Math.round((classRev[k] / totalRev) * 1000) / 10 : 0

    const abc = {
      // Task 12-b spec shape: keyed classes + topAItems
      A: { count: classCount.A, revenueShare: shareOf('A') },
      B: { count: classCount.B, revenueShare: shareOf('B') },
      C: { count: classCount.C, revenueShare: shareOf('C') },
      topAItems: topA,
      // additive aliases consumed by the WarehouseSection UI (kept in sync)
      classes: (['A', 'B', 'C'] as const).map((k) => ({
        class: k,
        count: classCount[k],
        revenueShare: shareOf(k),
      })),
      topA,
    }

    // ---------- reorder suggestions ----------
    // avg daily demand from Sales over the last 30 days
    const qty30 = new Map<number, number>()
    for (const s of sales60) {
      if (s.productId == null) continue
      if (new Date(s.createdAt).getTime() < since30.getTime()) continue
      qty30.set(s.productId, (qty30.get(s.productId) ?? 0) + s.qty)
    }

    const reorderCandidates = products
      .map((p) => {
        const q30 = qty30.get(p.id) ?? 0
        const demand = q30 > 0 ? Math.max(q30 / 30, 0.1) : 0
        const rop = demand * LEAD_DAYS + p.minStock
        return { p, demand, rop }
      })
      .filter(({ p, rop }) => p.stock <= Math.max(p.minStock, rop))
      .map(({ p, demand }) => ({
        productId: p.id,
        name: p.name,
        stock: p.stock,
        minStock: p.minStock,
        avgDailyDemand: r2(demand),
        suggestQty: Math.max(Math.round(p.minStock * 1.5 - p.stock), 1),
        supplierName: p.supplier?.name ?? null,
      }))
      .sort((a, b) => {
        // urgency: stock/minStock ratio ascending (no-minStock products last)
        const ra = a.minStock > 0 ? a.stock / a.minStock : Number.MAX_SAFE_INTEGER
        const rb = b.minStock > 0 ? b.stock / b.minStock : Number.MAX_SAFE_INTEGER
        return ra - rb
      })
    const reorder = reorderCandidates.slice(0, 12)

    // ---------- FEFO: expiring-soon batches ----------
    // For perishables (shelfLifeDays set), find the most recent RECEIVED
    // batch (order receivingDate) → expiry = receiving + shelfLifeDays.
    const perishables = products.filter(
      (p) => p.shelfLifeDays != null && p.shelfLifeDays > 0 && p.stock > 0
    )
    let expiring: {
      productId: number
      name: string
      qty: number
      receivedAt: string
      expiryDate: string
      daysLeft: number
      stockValue: number
      suggestMarkdown: boolean
    }[] = []
    if (perishables.length > 0) {
      const receivedItems = await db.orderItem.findMany({
        where: {
          productId: { in: perishables.map((p) => p.id) },
          order: { status: { in: ['RECEIVED', 'CONFIRMED', 'DONE'] } },
        },
        select: {
          productId: true,
          order: { select: { receivingDate: true } },
        },
        orderBy: { id: 'desc' },
      })
      const lastReceived = new Map<number, Date>()
      for (const it of receivedItems) {
        const d = it.order.receivingDate
        if (!d) continue
        const pid = it.productId as number
        const cur = lastReceived.get(pid)
        if (!cur || d > cur) lastReceived.set(pid, d)
      }
      expiring = perishables
        .map((p) => {
          const received = lastReceived.get(p.id)
          if (!received) return null
          const expiry = new Date(received.getTime() + (p.shelfLifeDays as number) * 86400000)
          const daysLeft = Math.ceil((expiry.getTime() - now) / 86400000)
          if (daysLeft > EXPIRY_WINDOW_DAYS) return null
          return {
            productId: p.id,
            name: p.name,
            qty: p.stock,
            receivedAt: received.toISOString(),
            expiryDate: expiry.toISOString(),
            daysLeft,
            stockValue: Math.round(p.stock * p.buyPrice),
            suggestMarkdown: daysLeft <= MARKDOWN_DAYS,
          }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => a.daysLeft - b.daysLeft)
    }

    // ---------- slow movers / markdown candidates ----------
    const sold60 = new Set(sales60.filter((s) => s.productId != null).map((s) => s.productId as number))
    const slow = products
      .filter((p) => p.stock > 0 && p.sellPrice > 0 && !sold60.has(p.id))
      .map((p) => ({
        productId: p.id,
        name: p.name,
        stock: p.stock,
        stockValue: Math.round(p.stock * p.buyPrice),
        sellPrice: p.sellPrice,
      }))
      .sort((a, b) => b.stockValue - a.stockValue)
      .slice(0, 10)

    await audit(
      userId,
      'INSIGHTS_VIEWED',
      'Product',
      null,
      `تحلیل هوشمند انبار — ${reorderCandidates.length.toLocaleString('fa-IR')} پیشنهاد سفارش — ${slow.length.toLocaleString('fa-IR')} کندگرد${expiring.length > 0 ? ` — ${expiring.length.toLocaleString('fa-IR')} در آستانه انقضا` : ''}`
    )

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      demandSource,
      counts: { A: classCount.A, B: classCount.B, C: classCount.C, reorder: reorderCandidates.length, slow: slow.length, expiring: expiring.length },
      abc,
      reorder,
      slow,
      expiring,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}
