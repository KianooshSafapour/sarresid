import { db } from '@/lib/db'
import { fail, getSessionUser, json, logActivity } from '@/lib/api-helpers'
import { addDaysIso } from '@/lib/jalali'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const product = await db.product.findUnique({ where: { id } })
  if (!product) return fail('کالا یافت نشد', 404)
  const lastMonth = new Date()
  lastMonth.setDate(lastMonth.getDate() - 30)
  const orderItems = await db.orderItem.findMany({ where: { productId: id } })
  const orderIds = [...new Set(orderItems.map((oi) => oi.orderId))]
  const orders = await db.order.findMany({ where: { id: { in: orderIds } } })
  const orderMap = new Map(orders.map((o) => [o.id, o]))
  const withOrders = orderItems
    .map((oi) => ({ oi, order: orderMap.get(oi.orderId) }))
    .filter((x) => x.order) as { oi: typeof orderItems[number]; order: (typeof orders)[number] }[]
  const relevant = withOrders.filter((x) => new Date(x.order.createdAt) >= lastMonth)
  // روند قیمت‌ها برای نمودار — واحد خرید و قیمت چاپ‌شده در هر سفارش
  const priceTrend = withOrders
    .sort((a, b) => new Date(a.order.createdAt).getTime() - new Date(b.order.createdAt).getTime())
    .map((x) => ({
      code: x.order.code,
      at: x.order.createdAt,
      unitBuyPrice: x.oi.unitBuyPrice,
      printedPrice: x.oi.printedPrice,
    }))
    .filter((x) => x.unitBuyPrice > 0 || (x.printedPrice ?? 0) > 0)
    .slice(-12)
  const history = {
    orderedLastMonth: relevant.reduce((s, x) => s + x.oi.qty, 0),
    ordersLastMonth: relevant.length,
    lastOrders: withOrders
      .sort((a, b) => new Date(b.order.createdAt).getTime() - new Date(a.order.createdAt).getTime())
      .slice(0, 8)
      .map((x) => ({ code: x.order.code, qty: x.oi.qty, at: x.order.createdAt, status: x.order.status })),
    priceTrend,
  }

  // ── گزارش تعاملی کالا (?report=1) — فقط وقتی مودال گزارش باز می‌شود صدا زده می‌شود ──
  if (new URL(req.url).searchParams.get('report') === '1') {
    const report = await buildProductReport(id, product)
    return json({ product: { ...product, barcodes: JSON.parse(product.barcodes || '[]') }, history, report })
  }

  return json({ product: { ...product, barcodes: JSON.parse(product.barcodes || '[]') }, history })
}

/** گزارش ۹۰ روزهٔ کالا: فروش روزانه (از پیش‌فاکتورها)، حاشیه (از تاریخ سفارش‌ها)، ضایعات، انقضاهای نزدیک و سهم دسته */
async function buildProductReport(id: string, product: { stock: number; reorderLevel: number; category: string; sellPrice: number; buyPrice: number }) {
  const since90 = new Date(Date.now() - 90 * 86400000)
  const since30 = new Date(Date.now() - 30 * 86400000)
  const preorders = await db.preOrder.findMany({
    where: { createdAt: { gte: since90 }, status: { not: 'CANCELLED' } },
    select: { items: true, createdAt: true },
  })

  // فروش روزانهٔ همین کالا + نقشهٔ تعداد ۹۰روزه/۳۰روزه برای سهم دسته
  const byDay = new Map<string, { qty: number; amount: number }>()
  const qty90 = new Map<string, number>()
  let sales30 = 0
  for (const po of preorders) {
    const day = new Date(po.createdAt).toISOString().slice(0, 10)
    try {
      for (const it of JSON.parse(po.items || '[]') as { productId?: string; qty?: number; price?: number }[]) {
        if (!it.productId) continue
        qty90.set(it.productId, (qty90.get(it.productId) || 0) + (it.qty || 0))
        if (it.productId !== id) continue
        const qty = it.qty || 0
        const price = it.price || 0
        const cell = byDay.get(day) || { qty: 0, amount: 0 }
        cell.qty += qty
        cell.amount += qty * price
        byDay.set(day, cell)
        if (new Date(po.createdAt) >= since30) sales30 += qty
      }
    } catch { /* سطر خراب — رد می‌شود */ }
  }
  const sales = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, qty: v.qty, amount: v.amount }))

  // حاشیه سود تاریخی از اقلام سفارش‌های خرید (خرید واحد vs قیمت چاپ‌شده)
  const orderItems = await db.orderItem.findMany({ where: { productId: id } })
  const orderIds = [...new Set(orderItems.map((oi) => oi.orderId))]
  const orders = await db.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, createdAt: true } })
  const orderAt = new Map(orders.map((o) => [o.id, o.createdAt]))
  const margins = orderItems
    .map((oi) => ({
      date: orderAt.get(oi.orderId)?.toISOString() || '',
      buyPrice: oi.unitBuyPrice,
      sellPrice: oi.printedPrice ?? 0,
    }))
    .filter((m) => m.date && m.buyPrice > 0 && m.sellPrice > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-24)
    .map((m) => ({ ...m, marginPct: Math.round(((m.sellPrice - m.buyPrice) / m.buyPrice) * 100) }))

  // ضایعات ثبت‌شدهٔ این کالا
  const wasteRows = await db.wasteLog.findMany({ where: { productId: id }, orderBy: { forDate: 'desc' }, take: 200 })
  const wasteByDay = new Map<string, { qty: number; estValue: number }>()
  for (const w of wasteRows) {
    const cell = wasteByDay.get(w.forDate) || { qty: 0, estValue: 0 }
    cell.qty += w.qty
    cell.estValue += w.estValue
    wasteByDay.set(w.forDate, cell)
  }
  const waste = [...wasteByDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, qty: v.qty, estValue: v.estValue }))
  const wasteTotal = waste.reduce((s, w) => s + w.estValue, 0)

  // انقضاهای نزدیک (از اقلام دریافت‌شدهٔ سفارش‌ها)
  const todayIso = new Date().toISOString().slice(0, 10)
  const expiryRows = await db.orderItem.findMany({
    where: { productId: id, expiryDate: { not: '' }, status: { not: 'REJECTED' } },
    orderBy: { expiryDate: 'asc' },
    take: 40,
  })
  const expiry = expiryRows
    .filter((oi) => oi.expiryDate >= todayIso)
    .slice(0, 12)
    .map((oi) => ({ date: oi.expiryDate, qty: oi.receivedQty ?? oi.qty, status: oi.status }))

  // سهم دسته: فروش ۳۰ روز این کالا در برابر خواهران همان دسته (برای نمودار دونات)
  const topIds = [...qty90.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 400).map(([k]) => k)
  const prods = topIds.length
    ? await db.product.findMany({ where: { id: { in: topIds } }, select: { id: true, name: true, category: true } })
    : []
  const catTotals = new Map<string, number>()
  const prodMap = new Map(prods.map((p) => [p.id, p]))
  for (const [pid, qty] of qty90.entries()) {
    const p = prodMap.get(pid)
    if (!p) continue
    catTotals.set(p.category, (catTotals.get(p.category) || 0) + qty)
  }
  const siblingRows = prods
    .filter((p) => p.category === product.category && p.id !== id)
    .map((p) => ({ id: p.id, name: p.name, value: qty90.get(p.id) || 0 }))
    .sort((a, b) => b.value - a.value)
  const categoryTotal = catTotals.get(product.category) || 0
  const thisValue = qty90.get(id) || 0
  const siblings = siblingRows.slice(0, 4)
  const othersValue = Math.max(0, categoryTotal - thisValue - siblings.reduce((s, x) => s + x.value, 0))

  const avgMarginPct = margins.length ? Math.round(margins.reduce((s, m) => s + m.marginPct, 0) / margins.length) : product.buyPrice > 0 ? Math.round(((product.sellPrice - product.buyPrice) / product.buyPrice) * 100) : 0

  // ── سفارش‌ها و خرید ۹۰ روز (اقلام سفارش خرید × سرفصل سفارش؛ بدون CANCELLED/DRAFT) ──
  const allItems = await db.orderItem.findMany({ where: { productId: id } })
  const allOrderIds = [...new Set(allItems.map((oi) => oi.orderId))]
  const allOrders = allOrderIds.length
    ? await db.order.findMany({
        where: { id: { in: allOrderIds }, status: { notIn: ['CANCELLED', 'DRAFT'] } },
        select: { id: true, createdAt: true, providerId: true, providerName: true },
      })
    : []
  const okOrder = new Map(allOrders.map((o) => [o.id, o]))
  const activeItems = allItems.filter((oi) => okOrder.has(oi.orderId))
  const since90Iso = since90.toISOString().slice(0, 10)

  const ordByDay = new Map<string, { qty: number; value: number }>()
  const provAgg = new Map<string, { name: string; qty: number; value: number; orders: Set<string> }>()
  const orderDays90 = new Set<string>()
  let totalQty90 = 0
  let totalBuy90 = 0
  for (const oi of activeItems) {
    const o = okOrder.get(oi.orderId)!
    const day = o.createdAt.toISOString().slice(0, 10)
    if (day >= since90Iso) {
      const cell = ordByDay.get(day) || { qty: 0, value: 0 }
      cell.qty += oi.qty
      cell.value += oi.qty * (oi.unitBuyPrice || 0)
      ordByDay.set(day, cell)
      totalQty90 += oi.qty
      totalBuy90 += oi.qty * (oi.unitBuyPrice || 0)
      orderDays90.add(oi.orderId)
      const p = provAgg.get(o.providerId) || { name: o.providerName, qty: 0, value: 0, orders: new Set<string>() }
      p.name = o.providerName
      p.qty += oi.qty
      p.value += oi.qty * (oi.unitBuyPrice || 0)
      p.orders.add(oi.orderId)
      provAgg.set(o.providerId, p)
    }
  }
  const ordersBuySeries = [...ordByDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, qty: v.qty, value: Math.round(v.value) }))
  const providers = [...provAgg.entries()]
    .map(([pid, p]) => ({ id: pid, name: p.name, qty: p.qty, value: Math.round(p.value), orders: p.orders.size }))
    .sort((a, b) => b.value - a.value)

  // فاصلهٔ میانگین سفارش‌ها (cadence) از کل تاریخچهٔ سفارش‌های فعال — برای تخمین سفارش بعدی
  const allOrderDays = [...new Set(allOrders.map((o) => o.createdAt.toISOString().slice(0, 10)))].sort()
  const avgGapDays =
    allOrderDays.length >= 2
      ? Math.max(1, Math.round((new Date(allOrderDays[allOrderDays.length - 1] + 'T12:00:00').getTime() - new Date(allOrderDays[0] + 'T12:00:00').getTime()) / 86400000 / (allOrderDays.length - 1)))
      : 0
  const nextExpectedIso = allOrderDays.length >= 2 && avgGapDays > 0 ? addDaysIso(avgGapDays, allOrderDays[allOrderDays.length - 1]) : ''

  return {
    stock: product.stock,
    reorderLevel: product.reorderLevel,
    sales30,
    avgMarginPct,
    sales,
    margins,
    waste,
    wasteTotal,
    expiry,
    ordersBuy: {
      series: ordersBuySeries,
      providers: providers.slice(0, 3),
      providersCount: provAgg.size,
      ordersCount: orderDays90.size,
      totalQty90,
      totalBuy90: Math.round(totalBuy90),
      avgGapDays,
      nextExpectedIso,
    },
    categoryShare: {
      category: product.category,
      thisValue,
      siblings,
      othersValue,
      categoryTotal,
      storeTotal: [...catTotals.values()].reduce((s, v) => s + v, 0),
      windowDays: 30,
    },
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const body = await req.json()
  const data: Record<string, unknown> = {}
  const fields = ['name', 'holooCode', 'unit', 'brand', 'category', 'imageUrl', 'notes', 'providerId']
  for (const f of fields) if (body[f] !== undefined) data[f] = body[f]
  for (const f of ['buyPrice', 'sellPrice', 'sellPrice2', 'stock', 'reorderLevel'])
    if (body[f] !== undefined) data[f] = Number(body[f]) || 0
  if (body.barcodes !== undefined) data.barcodes = JSON.stringify((body.barcodes as string[]).filter(Boolean))
  if (body.addBarcode) {
    const p = await db.product.findUnique({ where: { id } })
    const list = JSON.parse(p?.barcodes || '[]') as string[]
    if (!list.includes(body.addBarcode)) list.push(body.addBarcode)
    data.barcodes = JSON.stringify(list)
  }
  if (body.inHoloo !== undefined) data.inHoloo = body.inHoloo
  const product = await db.product.update({ where: { id }, data })
  await logActivity(me, 'ویرایش کالا', 'product', id, product.name)
  return json({ product: { ...product, barcodes: JSON.parse(product.barcodes) } })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getSessionUser(req)
  if (!me || !['GM', 'OM', 'PM', 'ACC'].includes(me.role)) return fail('دسترسی غیرمجاز', 403)
  await db.product.update({ where: { id }, data: { active: false } })
  await logActivity(me, 'حذف (غیرفعال‌سازی) کالا', 'product', id)
  return json({ ok: true })
}
