import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { logAudit } from '@/lib/audit'
import { parseBarcodes, productOut } from '../route'

// ============ GET: detail with last orders + sale stats ============

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  const { id } = await ctx.params

  const product = await db.product.findUnique({
    where: { id },
    include: { company: { select: { id: true, name: true } } },
  })
  if (!product) return Response.json({ error: 'محصول یافت نشد' }, { status: 404 })

  const items = await db.orderItem.findMany({
    where: { productId: id },
    include: { order: { select: { id: true, number: true, createdAt: true, status: true } } },
  })

  items.sort((a, b) => new Date(b.order.createdAt).getTime() - new Date(a.order.createdAt).getTime())

  const lastOrders = items.slice(0, 8).map((it) => ({
    orderId: it.order.id,
    orderNumber: it.order.number,
    orderStatus: it.order.status,
    qty: it.quantity,
    receivedQty: it.receivedQty,
    lineTotal: it.lineTotal,
    date: it.order.createdAt,
  }))

  const distinctOrderIds = new Set(items.map((it) => it.orderId))
  const stats = {
    totalQty: items.reduce((s, it) => s + (it.receivedQty ?? it.quantity), 0),
    totalAmount: items.reduce((s, it) => s + it.lineTotal, 0),
    ordersCount: distinctOrderIds.size,
  }

  return Response.json({ product: productOut(product), lastOrders, stats })
}

// ============ PATCH: update ============

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.MANAGE_PRODUCTS)) {
    return Response.json({ error: 'اجازه مدیریت محصولات را ندارید' }, { status: 403 })
  }
  const { id } = await ctx.params

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return Response.json({ error: 'درخواست نامعتبر است' }, { status: 400 })

  const existing = await db.product.findUnique({ where: { id } })
  if (!existing) return Response.json({ error: 'محصول یافت نشد' }, { status: 404 })

  const data: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return Response.json({ error: 'نام محصول نمی‌تواند خالی باشد' }, { status: 400 })
    data.name = name
  }
  if (body.holooName !== undefined) data.holooName = body.holooName ? String(body.holooName) : null
  if (body.barcodes !== undefined || body.barcode !== undefined) {
    const barcodes = body.barcodes !== undefined ? parseBarcodes(body.barcodes) : parseBarcodes(existing.barcodes)
    const bc = body.barcode ? String(body.barcode).trim() : ''
    if (bc && !barcodes.includes(bc)) barcodes.unshift(bc)
    data.barcodes = JSON.stringify(barcodes)
    data.barcode = barcodes[0] || null
  }
  if (body.price !== undefined) data.price = Number(body.price) || 0
  if (body.cost !== undefined) data.cost = Number(body.cost) || 0
  if (body.stock !== undefined) data.stock = Number(body.stock) || 0
  if (body.minStock !== undefined) data.minStock = Number(body.minStock) || 0
  if (body.unit !== undefined) data.unit = String(body.unit) || 'عدد'
  if (body.category !== undefined) data.category = body.category ? String(body.category) : null
  if (body.companyId !== undefined) data.companyId = (body.companyId as string) || null
  if (body.image !== undefined) data.image = body.image ? String(body.image) : null
  if (body.isWeight !== undefined) data.isWeight = !!body.isWeight
  if (body.active !== undefined) data.active = !!body.active

  const updated = await db.product.update({
    where: { id },
    data: data as never,
    include: { company: { select: { id: true, name: true } } },
  })

  await logAudit(session.id, session.name, 'UPDATE_PRODUCT', 'PRODUCT', id, { fields: Object.keys(data), name: updated.name })
  return Response.json({ product: productOut(updated) })
}

// ============ DELETE: soft delete ============

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.MANAGE_PRODUCTS)) {
    return Response.json({ error: 'اجازه مدیریت محصولات را ندارید' }, { status: 403 })
  }
  const { id } = await ctx.params

  const existing = await db.product.findUnique({ where: { id } })
  if (!existing) return Response.json({ error: 'محصول یافت نشد' }, { status: 404 })

  await db.product.update({ where: { id }, data: { active: false } })
  await logAudit(session.id, session.name, 'DELETE_PRODUCT', 'PRODUCT', id, { name: existing.name, soft: true })
  return Response.json({ ok: true })
}
