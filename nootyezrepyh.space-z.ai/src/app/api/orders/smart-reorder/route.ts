import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { logAudit, logHistory } from '@/lib/audit'
import { todayJalali, addDaysJalali } from '@/lib/jalali'

/** Allowed target-coverage multipliers (× minStock) for smart reorder */
const COVERAGES = [1.5, 2, 3] as const
function parseCoverage(v: string | null | undefined): number {
  const n = Number(v)
  return (COVERAGES as readonly number[]).includes(n) ? n : 2
}

/** GET /api/orders/smart-reorder — low-stock products grouped by supplier with suggested qty.
 *  Suggested qty tops the stock back up to coverage× minStock (at least +1).
 *  Query: ?coverage=1.5|2|3 (default 2)
 *  Gate: MANAGE_ORDERS
 */
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.MANAGE_ORDERS))
    return Response.json({ error: 'شما اجازهٔ پیشنهاد سفارش ندارید' }, { status: 403 })
  const coverage = parseCoverage(req.nextUrl.searchParams.get('coverage'))

  const products = await db.product.findMany({
    where: { active: true, mergedInto: null },
    include: { company: { include: { suppliers: true } } },
  })
  const low = products.filter((p) => p.stock <= p.minStock)

  // supplier of a product = suppliers linked through its company (first link wins; demo-scale assumption)
  const supplierIds = new Set<string>()
  for (const p of low) { if (p.company) for (const s of p.company.suppliers) supplierIds.add(s.id) }
  const suppliers = supplierIds.size
    ? await db.supplier.findMany({ where: { id: { in: [...supplierIds] } }, select: { id: true, name: true, paymentType: true } })
    : []
  const supplierMap = new Map(suppliers.map((s) => [s.id, s]))

  const groups: Record<string, {
    supplierId: string
    supplierName: string
    paymentType: string | null
    items: { productId: string; name: string; stock: number; minStock: number; suggestedQty: number; unitPrice: number; estimated: number }[]
    estimatedTotal: number
  }> = {}
  const orphans: { name: string; stock: number }[] = []

  for (const p of low) {
    const sid = p.company?.suppliers[0]?.id
    if (!sid || !supplierMap.has(sid)) {
      orphans.push({ name: p.name, stock: p.stock })
      continue
    }
    const g = (groups[sid] ||= {
      supplierId: sid,
      supplierName: supplierMap.get(sid)!.name,
      paymentType: supplierMap.get(sid)!.paymentType,
      items: [],
      estimatedTotal: 0,
    })
    const suggestedQty = Math.max(Math.ceil(p.minStock * coverage) - p.stock, 1)
    const estimated = suggestedQty * p.cost
    g.items.push({ productId: p.id, name: p.name, stock: p.stock, minStock: p.minStock, suggestedQty, unitPrice: p.cost, estimated })
    g.estimatedTotal += estimated
  }

  const groupList = Object.values(groups).sort((a, b) => b.estimatedTotal - a.estimatedTotal)
  return Response.json({
    suppliers: groupList,
    orphans,
    totalEstimated: groupList.reduce((s, g) => s + g.estimatedTotal, 0),
    productCount: low.length,
    criticalCount: low.filter((p) => p.stock <= p.minStock * 0.5).length,
    coverage,
    coverages: COVERAGES,
  })
}

/** POST /api/orders/smart-reorder — create one DRAFT order per selected supplier.
 *  Body: { supplierIds?: string[], deliveryDate?: string, coverage?: 1.5|2|3, overrides?: Record<productId, qty> }
 *  Base quantities are recomputed server-side; client may override per-item qty,
 *  but each override is clamped to an integer 1..9999 before use.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.MANAGE_ORDERS))
    return Response.json({ error: 'شما اجازهٔ ثبت سفارش ندارید' }, { status: 403 })

  const body = (await req.json().catch(() => null)) as {
    supplierIds?: string[]
    deliveryDate?: string
    coverage?: number
    overrides?: Record<string, unknown>
  } | null
  if (!body) return Response.json({ error: 'داده نامعتبر است' }, { status: 400 })

  // sanitize per-item overrides — only sane integers survive
  const overrides: Record<string, number> = {}
  if (body.overrides && typeof body.overrides === 'object') {
    for (const [pid, q] of Object.entries(body.overrides)) {
      const n = Math.floor(Number(q))
      if (Number.isFinite(n) && n >= 1 && n <= 9999) overrides[pid] = n
    }
  }
  const coverage = parseCoverage(body.coverage == null ? null : String(body.coverage))

  // recompute suggestion server-side — client never sends quantities
  const products = await db.product.findMany({
    where: { active: true, mergedInto: null },
    include: { company: { include: { suppliers: true } } },
  })
  const low = products.filter((p) => p.stock <= p.minStock)

  const bySupplier: Record<string, typeof low> = {}
  for (const p of low) {
    const sid = p.company?.suppliers[0]?.id
    if (!sid) continue
    if (body.supplierIds && !body.supplierIds.includes(sid)) continue
    ;(bySupplier[sid] ||= []).push(p)
  }
  const sids = Object.keys(bySupplier)
  if (sids.length === 0) return Response.json({ error: 'هیچ کالای کمبودداری برای سفارش یافت نشد' }, { status: 400 })

  const suppliers = await db.supplier.findMany({ where: { id: { in: sids } } })
  const supplierMap = new Map(suppliers.map((s) => [s.id, s]))

  const agg = await db.order.aggregate({ _max: { number: true } })
  let number = Math.max(100, agg._max.number || 100)
  const today = todayJalali()
  const delivery = typeof body.deliveryDate === 'string' && /^\d{4}\/\d{2}\/\d{2}$/.test(body.deliveryDate) ? body.deliveryDate : addDaysJalali(today, 2)

  const created: { id: string; number: number; supplierName: string; itemCount: number; totalAmount: number }[] = []

  for (const sid of sids) {
    const supplier = supplierMap.get(sid)!
    const itemData = bySupplier[sid].map((p) => {
      const baseQty = Math.max(Math.ceil(p.minStock * coverage) - p.stock, 1)
      const quantity = overrides[p.id] ?? baseQty
      const lineTotal = quantity * p.cost
      return {
        productId: p.id,
        productName: p.name,
        holooName: p.holooName,
        barcode: p.barcode,
        quantity,
        unitPrice: p.cost,
        sellPrice: p.price,
        discount: 0,
        lineTotal,
        status: 'OK',
      }
    })
    const totalAmount = itemData.reduce((s, it) => s + it.lineTotal, 0)
    number += 1

    const order = await db.order.create({
      data: {
        number,
        supplierId: sid,
        createdById: session.id,
        status: 'DRAFT',
        deliveryDate: delivery,
        paymentType: supplier.paymentType || 'CHEQUE',
        totalAmount,
        discount: 0,
        finalAmount: totalAmount,
        notes: 'پیشنهاد هوشمند سامانه برای جبران کمبود موجودی',
        items: { create: itemData },
      },
    })

    const tweaked = itemData.filter((it, i) => overrides[bySupplier[sid][i].id] != null).length
    await logAudit(session.id, session.name, 'SMART_REORDER', 'ORDER', order.id, {
      number: order.number,
      supplier: supplier.name,
      itemCount: itemData.length,
      totalAmount,
      coverage,
      overrides: tweaked,
    })
    await logHistory('ORDER', order.id, session.id, session.name, 'سفارش پیشنهادی هوشمند', {
      fromStatus: null,
      toStatus: 'DRAFT',
      description: tweaked > 0
        ? `سامانه ${itemData.length} قلم را برای «${supplier.name}» پیشنهاد داد؛ کاربر ${tweaked} قلم را دستی تنظیم کرد (پوشش ×${coverage})`
        : `سامانه ${itemData.length} قلم کالای کمبوددار را برای «${supplier.name}» پیشنهاد داد (پوشش ×${coverage})`,
      items: itemData.map((it) => ({ name: it.productName, qty: it.quantity, unitPrice: it.unitPrice })),
    })

    created.push({ id: order.id, number: order.number, supplierName: supplier.name, itemCount: itemData.length, totalAmount })
  }

  return Response.json({ ok: true, created })
}
