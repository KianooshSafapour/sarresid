import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok } from '@/lib/server-utils'

// ============================================================
// GET /api/reports/shrinkage
// Shrinkage & waste intelligence («کسری و ضایعات»)
// Built from committed stock-count sessions (last N days):
//   - shrink items: counted < system → value lost × buyPrice
//   - surplus items: counted > system → value found
//   - shrinkRate = |shrink value| / sales over the same window
// Benchmarks (research): healthy retail shrink < 1% of revenue;
// > 2.5% needs process review (receiving control, theft, expiry).
// ============================================================

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  if (!user.isManager) return fail('دسترسی غیرمجاز', 403)

  const url = new URL(req.url)
  const days = Math.min(90, Math.max(7, parseInt(url.searchParams.get('days') ?? '30') || 30))
  const since = new Date()
  since.setDate(since.getDate() - days)

  const counts = await db.stockCount.findMany({
    where: { status: 'COMMITTED', committedAt: { gte: since } },
    include: {
      items: {
        where: { countedQty: { not: null } },
        include: { product: { select: { name: true, category: true, buyPrice: true } } },
      },
    },
    orderBy: { committedAt: 'desc' },
  })

  const sales = await db.productSale.aggregate({
    _sum: { amount: true },
    where: { date: { gte: since } },
  })
  const salesTotal = sales._sum.amount ?? 0

  let shrinkValue = 0
  let surplusValue = 0
  let diffItems = 0
  const byCategory = new Map<string, { shrink: number; surplus: number; items: number }>()
  const sessions: { code: string; committedAt: string | null; scope: string; category: string | null; shrinkValue: number; surplusValue: number; diffItems: number; topLosses: { name: string; qty: number; value: number }[] }[] = []

  for (const c of counts) {
    let cShrink = 0
    let cSurplus = 0
    let cDiff = 0
    const losses: { name: string; qty: number; value: number }[] = []
    for (const it of c.items) {
      const counted = it.countedQty ?? 0
      const diff = counted - it.systemStock
      if (diff === 0) continue
      cDiff++
      const value = Math.abs(diff) * it.product.buyPrice
      if (diff < 0) {
        cShrink += value
        losses.push({ name: it.product.name, qty: Math.abs(diff), value: Math.round(value) })
      } else {
        cSurplus += value
      }
      const cat = it.product.category || 'عمومی'
      const agg = byCategory.get(cat) ?? { shrink: 0, surplus: 0, items: 0 }
      if (diff < 0) agg.shrink += value
      else agg.surplus += value
      agg.items++
      byCategory.set(cat, agg)
    }
    shrinkValue += cShrink
    surplusValue += cSurplus
    diffItems += cDiff
    sessions.push({
      code: c.code,
      committedAt: c.committedAt ? c.committedAt.toISOString() : null,
      scope: c.scope,
      category: c.category,
      shrinkValue: Math.round(cShrink),
      surplusValue: Math.round(cSurplus),
      diffItems: cDiff,
      topLosses: losses.sort((a, b) => b.value - a.value).slice(0, 3),
    })
  }

  const shrinkRate = salesTotal > 0 ? (shrinkValue / salesTotal) * 100 : null
  // health: <1% green, <2.5% yellow, else red (research benchmark)
  const health = shrinkRate === null ? 'NO_DATA' : shrinkRate < 1 ? 'GOOD' : shrinkRate < 2.5 ? 'WARN' : 'BAD'

  return ok({
    days,
    salesTotal: Math.round(salesTotal),
    shrinkValue: Math.round(shrinkValue),
    surplusValue: Math.round(surplusValue),
    netValue: Math.round(shrinkValue - surplusValue),
    shrinkRate: shrinkRate === null ? null : Math.round(shrinkRate * 100) / 100,
    health,
    diffItems,
    sessionCount: counts.length,
    categories: [...byCategory.entries()]
      .map(([category, v]) => ({ category, shrink: Math.round(v.shrink), surplus: Math.round(v.surplus), items: v.items }))
      .sort((a, b) => b.shrink - a.shrink)
      .slice(0, 8),
    sessions,
    benchmarkFa: 'شاخص جهانی: کسری سالم زیر ۱٪ فروش — بالای ۲٫۵٪ نیازمند بازبینی فرایند دریافت و نگهداری',
  })
}
