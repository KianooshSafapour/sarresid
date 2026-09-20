import { db } from '@/lib/db'
import { getSetting, setSetting, notifyRoles, logActivity } from '@/lib/server-utils'
import { addDays, isoDay, money } from '@/lib/jalali'

// ============================================================
// Weekly intelligence digest — the "poor-man's cron" companion.
// computeWeeklyDigest()  → pure data (7-day sales/margin/SPHL,
//                          top product, stock gaps, cheque horizon,
//                          open orders, count-session diffs)
// maybeSendWeeklyDigest()→ sends ONE digest notification per week
//                          (deduped via the last_weekly_digest
//                          setting) to owner/gm/om roles.
// Triggered from the watchdog (dashboard mount) and manually from
// the Reports section card.
// ============================================================

export const WEEKLY_DIGEST_KEY = 'last_weekly_digest'
const WEEK_MS = 6.5 * 24 * 3600 * 1000 // dedup: at most once per ~6.5 days

export interface WeeklyDigest {
  weekLabel: string
  from: string
  to: string
  sales7: number
  margin7: number
  marginRate: number
  sphl: number
  staffCount: number
  laborHours: number
  topProduct: { name: string; amount: number } | null
  lowStock: number
  outOfStock: number
  chequesDue: { count: number; sum: number }
  openOrders: number
  countDiffs: number
  generatedAt: string
}

export async function computeWeeklyDigest(): Promise<WeeklyDigest> {
  const now = new Date()
  const since = addDays(now, -7)
  const horizon = addDays(now, 7)

  const [sales, staffCount, laborHoursStr, products, chequesDue, openOrders, recentCounts] = await Promise.all([
    db.productSale.findMany({
      where: { date: { gte: since } },
      include: { product: { select: { name: true, buyPrice: true, sellPrice: true } } },
    }),
    db.user.count({ where: { active: true } }),
    getSetting('labor_hours_per_day', '8'),
    db.product.findMany({
      where: { status: 'ACTIVE' },
      select: { stock: true, minStock: true },
    }),
    db.cheque.aggregate({
      where: { status: { in: ['PENDING_OWNER', 'SIGNED', 'DELIVERED'] }, dueDate: { gte: now, lte: horizon } },
      _sum: { amount: true },
      _count: true,
    }),
    db.order.count({ where: { status: { in: ['PENDING_APPROVAL', 'APPROVED', 'SENT', 'RECEIVED_BY_DELIVERY', 'RECEIVING'] } } }),
    db.stockCount.findMany({
      where: { status: 'COMMITTED', committedAt: { gte: since } },
      select: { items: { where: { countedQty: { not: null } }, select: { systemStock: true, countedQty: true } } },
    }),
  ])

  const sales7 = Math.round(sales.reduce((s, x) => s + x.amount, 0))
  const margin7 = Math.round(sales.reduce((s, x) => s + x.qty * ((x.product?.sellPrice ?? 0) - (x.product?.buyPrice ?? 0)), 0))
  const laborHours = Math.max(1, Number(laborHoursStr) || 8)
  const sphl = Math.round(sales7 / Math.max(1, staffCount * 7 * laborHours))

  const prodMap = new Map<string, number>()
  for (const s of sales) {
    const name = s.product?.name ?? '—'
    prodMap.set(name, (prodMap.get(name) ?? 0) + s.amount)
  }
  const top = [...prodMap.entries()].sort((a, b) => b[1] - a[1])[0]

  return {
    weekLabel: 'هفت روز گذشته',
    from: isoDay(since),
    to: isoDay(now),
    sales7,
    margin7,
    marginRate: sales7 > 0 ? Math.round((margin7 / sales7) * 100) : 0,
    sphl,
    staffCount,
    laborHours,
    topProduct: top ? { name: top[0], amount: Math.round(top[1]) } : null,
    lowStock: products.filter((p) => p.stock > 0 && p.stock <= p.minStock).length,
    outOfStock: products.filter((p) => p.stock <= 0).length,
    chequesDue: { count: chequesDue._count ?? 0, sum: chequesDue._sum.amount ?? 0 },
    openOrders,
    countDiffs: recentCounts.reduce(
      (n, c) => n + c.items.filter((i) => i.countedQty !== i.systemStock).length,
      0
    ),
    generatedAt: now.toISOString(),
  }
}

/** Send at most one digest per week. Returns whether it fired. */
export async function maybeSendWeeklyDigest(): Promise<{ sent: boolean; lastRun: string | null }> {
  const last = await getSetting(WEEKLY_DIGEST_KEY, '')
  const now = new Date()
  if (last) {
    const lastDate = new Date(`${last}T00:00:00`)
    if (!Number.isNaN(lastDate.getTime()) && now.getTime() - lastDate.getTime() < WEEK_MS) {
      return { sent: false, lastRun: last }
    }
  }
  await sendWeeklyDigest()
  return { sent: true, lastRun: isoDay(now) }
}

/** Compute + notify the management trio + stamp the setting. */
export async function sendWeeklyDigest(): Promise<WeeklyDigest> {
  const d = await computeWeeklyDigest()
  await notifyRoles(
    ['owner', 'gm', 'om'],
    `گزارش هفتگی آماده است — فروش ۷ روز: ${money(d.sales7)} تومان`,
    `سود تخمینی ${money(d.margin7)} (حاشیه ${d.marginRate}٪) · SPHL ${money(d.sphl)} · پرفروش‌ترین: ${d.topProduct?.name ?? '—'} · کمبود: ${d.lowStock + d.outOfStock} قلم · چک‌های ۷ روز آینده: ${d.chequesDue.count} فقره`,
    'INFO',
    'reports'
  )
  await setSetting(WEEKLY_DIGEST_KEY, isoDay(new Date()))
  return d
}
