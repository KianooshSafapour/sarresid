import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/auth'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { logAudit } from '@/lib/audit'

// ============ helpers ============

interface ProductCreateBody {
  id?: string
  name?: string
  holooName?: string | null
  barcode?: string | null
  barcodes?: unknown
  price?: number
  cost?: number
  stock?: number
  minStock?: number
  unit?: string
  category?: string | null
  companyId?: string | null
  image?: string | null
  isWeight?: boolean
  active?: boolean
}

export function parseBarcodes(v: unknown): string[] {
  let list: unknown[] = []
  if (Array.isArray(v)) list = v
  else if (typeof v === 'string' && v.trim()) list = [v]
  const out: string[] = []
  for (const item of list) {
    const s = String(item ?? '').trim()
    if (s && !out.includes(s)) out.push(s)
  }
  return out
}

export function productOut(p: {
  id: string; name: string; holooName: string | null; barcode: string | null; barcodes: string
  price: number; cost: number; stock: number; minStock: number; unit: string; category: string | null
  companyId: string | null; company?: { id: string; name: string } | null; image: string | null
  holooCode: string | null; isWeight: boolean; active: boolean; mergedInto: string | null
  createdAt: Date; updatedAt: Date
}) {
  return {
    ...p,
    barcodes: (() => { try { return JSON.parse(p.barcodes || '[]') as string[] } catch { return [] as string[] } })(),
  }
}

export function productWhereFromParams(searchParams: URLSearchParams): Record<string, unknown> {
  const where: Record<string, unknown> = { active: true, mergedInto: null }
  const q = (searchParams.get('q') || '').trim()
  const category = (searchParams.get('category') || '').trim()
  const companyId = (searchParams.get('companyId') || '').trim()
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { holooName: { contains: q } },
      { barcode: { contains: q } },
      { barcodes: { contains: q } },
    ]
  }
  if (category) where.category = category
  if (companyId) where.companyId = companyId
  return where
}

/** Normalize a product name for duplicate detection */
export function normalizeProductName(s: string): string {
  return String(s || '')
    .replace(/[\u200c\u200f\u200e\u064b-\u0652]/g, '')
    .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase()
}

// ============ GET: list ============

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()

  const { searchParams } = new URL(req.url)
  const where = productWhereFromParams(searchParams)

  const [products, companies] = await Promise.all([
    db.product.findMany({
      where: where as never,
      include: { company: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    }),
    db.company.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ])

  const lowStock = searchParams.get('lowStock') === '1'
  const filtered = lowStock ? products.filter((p) => p.stock <= p.minStock) : products

  const stats = {
    critical: products.filter((p) => p.stock <= p.minStock * 0.5).length,
    low: products.filter((p) => p.stock > p.minStock * 0.5 && p.stock <= p.minStock).length,
    total: products.length,
  }
  const categories = Array.from(new Set(products.map((p) => p.category).filter(Boolean))) as string[]

  return Response.json({ products: filtered.map(productOut), companies, categories, stats })
}

// ============ POST: create ============

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.MANAGE_PRODUCTS)) {
    return Response.json({ error: 'اجازه مدیریت محصولات را ندارید' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as ProductCreateBody | null
  if (!body) return Response.json({ error: 'درخواست نامعتبر است' }, { status: 400 })
  const name = String(body.name || '').trim()
  if (!name) return Response.json({ error: 'نام محصول الزامی است' }, { status: 400 })

  const barcodes = parseBarcodes(body.barcodes)
  if (body.barcode && !barcodes.includes(String(body.barcode).trim())) barcodes.unshift(String(body.barcode).trim())

  const created = await db.product.create({
    data: {
      name,
      holooName: body.holooName ? String(body.holooName) : null,
      barcode: barcodes[0] || null,
      barcodes: JSON.stringify(barcodes),
      price: Number(body.price) || 0,
      cost: Number(body.cost) || 0,
      stock: Number(body.stock) || 0,
      minStock: Number(body.minStock) || 0,
      unit: String(body.unit || 'عدد'),
      category: body.category ? String(body.category) : null,
      companyId: body.companyId || null,
      image: body.image ? String(body.image) : null,
      isWeight: !!body.isWeight,
      active: body.active !== false,
    },
    include: { company: { select: { id: true, name: true } } },
  })

  await logAudit(session.id, session.name, 'CREATE_PRODUCT', 'PRODUCT', created.id, { name })
  return Response.json({ product: productOut(created) }, { status: 201 })
}

// ============ PATCH: update (by body.id) ============

export async function PATCH(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.MANAGE_PRODUCTS)) {
    return Response.json({ error: 'اجازه مدیریت محصولات را ندارید' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as ProductCreateBody | null
  const id = body?.id
  if (!body || !id) return Response.json({ error: 'شناسه محصول الزامی است' }, { status: 400 })

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
    if (body.barcode && !barcodes.includes(String(body.barcode).trim())) barcodes.unshift(String(body.barcode).trim())
    data.barcodes = JSON.stringify(barcodes)
    data.barcode = barcodes[0] || null
  }
  if (body.price !== undefined) data.price = Number(body.price) || 0
  if (body.cost !== undefined) data.cost = Number(body.cost) || 0
  if (body.stock !== undefined) data.stock = Number(body.stock) || 0
  if (body.minStock !== undefined) data.minStock = Number(body.minStock) || 0
  if (body.unit !== undefined) data.unit = String(body.unit) || 'عدد'
  if (body.category !== undefined) data.category = body.category ? String(body.category) : null
  if (body.companyId !== undefined) data.companyId = body.companyId || null
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

// ============ DELETE: soft delete (?id=) ============

export async function DELETE(req: NextRequest) {
  const session = await getSessionUser(req)
  if (!session) return unauthorized()
  if (!canUser(session.roles, PERMISSIONS.MANAGE_PRODUCTS)) {
    return Response.json({ error: 'اجازه مدیریت محصولات را ندارید' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return Response.json({ error: 'شناسه محصول الزامی است' }, { status: 400 })

  const existing = await db.product.findUnique({ where: { id } })
  if (!existing) return Response.json({ error: 'محصول یافت نشد' }, { status: 404 })

  await db.product.update({ where: { id }, data: { active: false } })
  await logAudit(session.id, session.name, 'DELETE_PRODUCT', 'PRODUCT', id, { name: existing.name, soft: true })
  return Response.json({ ok: true })
}
