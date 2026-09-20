import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, logActivity } from '@/lib/server-utils'
import { stockLevel } from '@/lib/types'

// GET /api/inventory — full stock overview
export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)

  const products = await db.product.findMany({
    where: { status: 'ACTIVE' },
    include: { barcodes: { orderBy: { isPrimary: 'desc' } } },
    orderBy: { name: 'asc' },
  })

  // category aggregation
  const catMap = new Map<string, { category: string; totalItems: number; totalStock: number; lowCount: number; value: number }>()
  let stockValue = 0
  let outOfStock = 0
  const lowStock: typeof products = []

  for (const p of products) {
    const value = p.stock * p.buyPrice
    stockValue += value
    if (p.stock <= 0) outOfStock++
    const isLow = p.stock <= p.minStock
    if (isLow) lowStock.push(p)
    const cat = catMap.get(p.category) ?? {
      category: p.category,
      totalItems: 0,
      totalStock: 0,
      lowCount: 0,
      value: 0,
    }
    cat.totalItems++
    cat.totalStock += p.stock
    if (isLow) cat.lowCount++
    cat.value += value
    catMap.set(p.category, cat)
  }

  // sort by severity: out-of-stock first, then stock/minStock ratio
  lowStock.sort((a, b) => {
    const aOut = a.stock <= 0 ? 0 : 1
    const bOut = b.stock <= 0 ? 0 : 1
    if (aOut !== bOut) return aOut - bOut
    const ra = a.stock / Math.max(1, a.minStock)
    const rb = b.stock / Math.max(1, b.minStock)
    return ra - rb
  })

  const byCategory = Array.from(catMap.values()).sort((a, b) => b.value - a.value)

  // days-of-cover per product (same velocity engine as /api/reorders/suggestions)
  const COVER_DAYS = 14
  const since = new Date()
  since.setDate(since.getDate() - COVER_DAYS)
  const sales = await db.productSale.groupBy({
    by: ['productId'],
    _sum: { qty: true },
    where: { date: { gte: since } },
  })
  const soldMap = new Map(sales.map((s) => [s.productId, s._sum.qty ?? 0]))
  const cover = (p: (typeof products)[number]) => {
    const avgDaily = (soldMap.get(p.id) ?? 0) / COVER_DAYS
    if (avgDaily <= 0) return null
    const daysCover = p.stock / avgDaily
    return {
      avgDaily: Math.round(avgDaily * 100) / 100,
      daysCover: Math.round(daysCover * 10) / 10,
      urgency:
        p.stock <= 0 || daysCover <= 2
          ? 'CRITICAL'
          : daysCover <= 4 || p.stock <= p.minStock
            ? 'WARN'
            : daysCover <= 7
              ? 'SOON'
              : 'OK',
    }
  }

  return ok({
    products,
    byCategory,
    lowStock,
    outOfStock,
    stockValue,
    cover: Object.fromEntries(products.map((p) => [p.id, cover(p)])),
    levels: products.length ? products.reduce((acc, p) => { acc[stockLevel(p.stock, p.minStock)] = (acc[stockLevel(p.stock, p.minStock)] ?? 0) + 1; return acc }, {} as Record<string, number>) : {},
  })
}

// PATCH /api/inventory — bulk stock / minStock update (managers + inventory)
export async function PATCH(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const allowed = user.isManager || user.roleKeys.includes('inventory')
  if (!allowed) return fail('دسترسی غیرمجاز', 403)

  const body = (await req.json()) as { updates?: { id: string; stock?: number; minStock?: number }[] }
  const updates = (body.updates ?? []).filter((u) => u.id && (u.stock !== undefined || u.minStock !== undefined))
  if (!updates.length) return fail('تغییری برای ثبت وجود ندارد')

  let applied = 0
  for (const u of updates) {
    const data: { stock?: number; minStock?: number } = {}
    if (u.stock !== undefined) data.stock = Math.max(0, Math.round(Number(u.stock) || 0))
    if (u.minStock !== undefined) data.minStock = Math.max(0, Math.round(Number(u.minStock) || 0))
    if (!Object.keys(data).length) continue
    await db.product.update({ where: { id: u.id }, data })
    applied++
  }

  await logActivity(user.id, user.name, 'ویرایش موجودی انبار', 'Product', undefined, `${applied} قلم به‌روزرسانی شد`)
  return ok({ success: true, applied })
}
