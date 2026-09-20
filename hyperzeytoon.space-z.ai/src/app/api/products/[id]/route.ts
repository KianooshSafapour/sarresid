import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, fail, ok, logActivity } from '@/lib/server-utils'
import { canEditCatalog, normalizeCode } from '../shared'
import { addDays, isoDay, toJalali, JALALI_MONTHS, toFaDigits } from '@/lib/jalali'

type Params = { params: Promise<{ id: string }> }

// GET /api/products/[id] — full detail: barcodes, 30d sales, recent orders, shelf placements
export async function GET(req: NextRequest, { params }: Params) {
  const user = await requireUser(req)
  if (!user) return fail('ابتدا وارد شوید', 401)
  const { id } = await params

  const product = await db.product.findUnique({
    where: { id },
    include: { barcodes: { orderBy: { isPrimary: 'desc' } } },
  })
  if (!product) return fail('کالا یافت نشد', 404)

  const since = addDays(new Date(), -30)
  const [sales, orderItems, shelves] = await Promise.all([
    db.productSale.findMany({
      where: { productId: id, date: { gte: since } },
      select: { date: true, qty: true, amount: true },
    }),
    db.orderItem.findMany({
      where: { productId: id },
      include: { order: { select: { id: true, code: true, receivingDate: true, status: true, providerName: true } } },
      orderBy: { order: { receivingDate: 'desc' } },
      take: 8,
    }),
    db.shelf.findMany({
      where: { productId: id },
      select: { id: true, name: true, section: true, row: true, col: true, capacity: true },
    }),
  ])

  // daily series for last 30 days
  const dayMap = new Map<string, { qty: number; amount: number }>()
  for (const s of sales) {
    const k = isoDay(s.date)
    const prev = dayMap.get(k) ?? { qty: 0, amount: 0 }
    dayMap.set(k, { qty: prev.qty + s.qty, amount: prev.amount + s.amount })
  }
  const salesDaily: { label: string; qty: number; amount: number }[] = []
  let totalQty = 0
  let totalAmount = 0
  const now = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = addDays(now, -i)
    const k = isoDay(d)
    const j = toJalali(d)
    const v = dayMap.get(k) ?? { qty: 0, amount: 0 }
    totalQty += v.qty
    totalAmount += v.amount
    salesDaily.push({ label: `${toFaDigits(j.jd)} ${JALALI_MONTHS[j.jm - 1].slice(0, 3)}`, qty: Math.round(v.qty * 100) / 100, amount: Math.round(v.amount) })
  }

  return ok({
    product,
    salesDaily,
    totals: { qty: Math.round(totalQty * 100) / 100, amount: Math.round(totalAmount) },
    recentOrders: orderItems.map((oi) => ({
      itemId: oi.id,
      orderId: oi.order.id,
      code: oi.order.code,
      providerName: oi.order.providerName,
      receivingDate: oi.order.receivingDate,
      status: oi.order.status,
      qty: oi.qty,
      unitPrice: oi.unitPrice,
      total: oi.total,
    })),
    shelves,
  })
}

// PATCH /api/products/[id] — update fields + barcodes add/remove (managers + accountant + inventory)
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await requireUser(req)
  if (!user || !canEditCatalog(user)) return fail('دسترسی غیرمجاز', 403)
  const { id } = await params

  const body = (await req.json()) as {
    name?: string
    altName?: string | null
    category?: string
    brand?: string | null
    unit?: string
    sellPrice?: number
    sellPrice2?: number | null
    buyPrice?: number
    taxRate?: number
    stock?: number
    minStock?: number
    capacity?: number
    image?: string | null
    status?: string
    notes?: string | null
    barcodes?: { add?: string[]; removeIds?: string[] }
  }

  const product = await db.product.findUnique({ where: { id }, include: { barcodes: true } })
  if (!product) return fail('کالا یافت نشد', 404)

  // ---------- field updates (track changed keys) ----------
  const data: Record<string, unknown> = {}
  const changed: string[] = []
  const candidates: [string, unknown][] = [
    ['name', body.name?.trim()],
    ['altName', body.altName !== undefined ? body.altName?.trim() || null : undefined],
    ['category', body.category?.trim()],
    ['brand', body.brand !== undefined ? body.brand?.trim() || null : undefined],
    ['unit', body.unit?.trim()],
    ['sellPrice', body.sellPrice],
    ['sellPrice2', body.sellPrice2],
    ['buyPrice', body.buyPrice],
    ['taxRate', body.taxRate],
    ['stock', body.stock !== undefined ? Math.max(0, Math.round(Number(body.stock) || 0)) : undefined],
    ['minStock', body.minStock !== undefined ? Math.max(0, Math.round(Number(body.minStock) || 0)) : undefined],
    ['capacity', body.capacity !== undefined ? Math.max(0, Math.round(Number(body.capacity) || 0)) : undefined],
    ['image', body.image !== undefined ? body.image : undefined],
    ['status', body.status],
    ['notes', body.notes !== undefined ? body.notes?.trim() || null : undefined],
  ]
  for (const [key, value] of candidates) {
    if (value === undefined) continue
    const current = (product as unknown as Record<string, unknown>)[key]
    if (current !== value) {
      data[key] = value
      changed.push(key)
    }
  }
  if (Object.keys(data).length) {
    await db.product.update({ where: { id }, data })
  }

  // ---------- barcode management ----------
  const bc = body.barcodes
  if (bc) {
    const addCodes = Array.from(new Set((bc.add ?? []).map(normalizeCode).filter(Boolean)))
    for (const code of addCodes) {
      const existing = await db.barcode.findUnique({ where: { code }, include: { product: { select: { name: true } } } })
      if (existing) {
        if (existing.productId === id) continue
        return fail(`بارکد ${code} قبلاً به کالای «${existing.product.name}» متصل است`)
      }
      await db.barcode.create({ data: { code, productId: id, isPrimary: product.barcodes.length === 0 } })
      changed.push('barcodes')
    }
    if (bc.removeIds?.length) {
      const res = await db.barcode.deleteMany({ where: { id: { in: bc.removeIds }, productId: id } })
      if (res.count) changed.push('barcodes')
    }
  }

  if (changed.length) {
    await logActivity(
      user.id,
      user.name,
      'ویرایش کالا',
      'Product',
      id,
      `${product.name} — فیلدها: ${Array.from(new Set(changed)).join('، ')}`
    )
  }
  return ok({ success: true, changed: Array.from(new Set(changed)) })
}

// DELETE /api/products/[id] — soft archive (managers only)
export async function DELETE(req: NextRequest, { params }: Params) {
  const user = await requireUser(req)
  if (!user || !user.isManager) return fail('دسترسی غیرمجاز', 403)
  const { id } = await params

  const product = await db.product.findUnique({ where: { id } })
  if (!product) return fail('کالا یافت نشد', 404)

  await db.product.update({ where: { id }, data: { status: 'ARCHIVED' } })
  await logActivity(user.id, user.name, 'آرشیو کالا', 'Product', id, product.name)
  return ok({ success: true })
}
