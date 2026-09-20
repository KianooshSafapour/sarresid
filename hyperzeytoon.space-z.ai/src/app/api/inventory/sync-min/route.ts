import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireManager, fail, ok, logActivity } from '@/lib/server-utils'

// ============================================================
// POST /api/inventory/sync-min
// Self-learning reorder point: raises minStock (NEVER lowers) to
// match the measured 30-day sales velocity.
//   reorderPoint = ceil(avgDaily30 × REORDER_COVER_DAYS)
// Products with no sales in the window are left untouched — the
// engine learns from demand, it never invents it.
// Response carries every change so the UI can show exactly what
// moved (audit-friendly; also written to the activity log).
// ============================================================

const WINDOW_DAYS = 30      // velocity look-back
const REORDER_COVER_DAYS = 7 // desired days of cover at reorder point

export async function POST(req: NextRequest) {
  const user = await requireManager(req)
  if (!user) return fail('دسترسی غیرمجاز — فقط مدیریت', 403)

  const since = new Date()
  since.setDate(since.getDate() - WINDOW_DAYS)

  const [products, sales] = await Promise.all([
    db.product.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, minStock: true },
      orderBy: { name: 'asc' },
    }),
    db.productSale.groupBy({
      by: ['productId'],
      _sum: { qty: true },
      where: { date: { gte: since } },
    }),
  ])
  const soldMap = new Map(sales.map((s) => [s.productId, s._sum.qty ?? 0]))

  const changes: { id: string; name: string; old: number; new: number }[] = []
  for (const p of products) {
    const avgDaily = (soldMap.get(p.id) ?? 0) / WINDOW_DAYS
    if (avgDaily <= 0) continue
    const reorderPoint = Math.ceil(avgDaily * REORDER_COVER_DAYS)
    if (reorderPoint > p.minStock) {
      await db.product.update({ where: { id: p.id }, data: { minStock: reorderPoint } })
      changes.push({ id: p.id, name: p.name, old: p.minStock, new: reorderPoint })
    }
  }

  if (changes.length) {
    await logActivity(
      user.id,
      user.name,
      'هم‌ترازی حد سفارش با سرعت فروش',
      'Product',
      undefined,
      `${changes.length} قلم حد سفارش‌شان بالا رفت (پنجره ${WINDOW_DAYS} روزه، پوشش ${REORDER_COVER_DAYS} روزه)`
    )
  }

  return ok({
    updated: changes.length,
    changes,
    scanned: products.length,
    windowDays: WINDOW_DAYS,
    coverDays: REORDER_COVER_DAYS,
  })
}
